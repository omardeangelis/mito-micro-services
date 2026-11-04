import { beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { serverLayer } from "@mito/server/effect/server"
import { readWave } from "../read"
import { createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"

// The time of the read of a Wave (T5, D10) at the volumes of the spec: a Wave
// of 9,000 customers, 15 operators, the rest of the CRM and two months of
// calls around it. It depends on the machine, so it runs only on request:
// PERF=1 pnpm test:pg

const WAVE = 9_000
/** Customers of the CRM outside the Wave, each with an active contact */
const OTHERS = 30_000
const OPERATORS = 15
/** Calls in the log, over the 60 days before today */
const CALLS = 60_000

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "lettura di una Wave da 9.000 clienti (D10)",
  () => {
    let runId = 0

    beforeAll(async () => {
      await migrateUpTo()
      const admin = await createOperator({ role: "ADMIN" })
      const team: number[] = []
      for (let i = 0; i < OPERATORS; i++) {
        team.push((await createOperator({ name: `Op${i}` })).id)
      }
      const [run] = await pgClient<{ id: number }[]>`
        INSERT INTO "mito-deutsche_import_run"
          (started_by, file_name, format, status, rows_total, rows_discarded, deadline)
        VALUES (${admin.userId}, 'perf.xlsx', 'wave', 'completed', ${WAVE}, 0,
                (now() + interval '20 days')::date)
        RETURNING id`
      runId = run!.id

      const total = WAVE + OTHERS
      // A third of the Wave without an operator, the rest spread over the team
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, name, surname, operator_id)
        SELECT 'c' || g, 't' || g, 'h' || g, 'inbound', 'MARIO', 'ROSSI',
               CASE WHEN g < ${WAVE} AND g % 3 = 0 THEN NULL
                    ELSE (${team}::int[])[1 + g % ${OPERATORS}] END
        FROM generate_series(0, ${total - 1}) AS g`
      await pgClient`
        INSERT INTO "mito-deutsche_import_run_customer" (run_id, customer_id, created)
        SELECT ${runId}, 'c' || g, g % 2 = 0
        FROM generate_series(0, ${WAVE - 1}) AS g`
      // Active contacts of the customers with an operator, in every state,
      // and a closed one each
      await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active, priority)
        SELECT c.id, c.operator_id,
               (ARRAY['chiamare','non risponde','richiamare','app.to','followup',
                      'caricato','non interessato','nessuno'])[1 + g % 8]::task_status,
               true, 120
        FROM "mito-deutsche_customers" AS c,
             LATERAL (SELECT substring(c.id from 2)::int AS g) AS n
        WHERE c.operator_id IS NOT NULL`
      await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active, priority)
        SELECT c.id, c.operator_id, 'non risponde', false, 0
        FROM "mito-deutsche_customers" AS c`
      // Calls of the team over the 60 days before today
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, outcome, origin, created_at)
        SELECT 'c' || (g % ${total}), (${team}::int[])[1 + g % ${OPERATORS}],
               'call', 'list', 'non risponde', 'list',
               now() - ((g % 60) + 1) * interval '1 day'
        FROM generate_series(0, ${CALLS - 1}) AS g`
      await pgClient`ANALYZE`
    }, 300_000)

    const readOnce = async () => {
      const started = performance.now()
      const wave = await Effect.runPromise(
        readWave(runId).pipe(Effect.provide(serverLayer))
      )
      return { ms: performance.now() - started, wave }
    }

    it("annota la mediana di 3 letture dopo un riscaldamento", async () => {
      const warmUp = await readOnce()
      expect(warmUp.wave.customers).toBe(WAVE)
      expect(warmUp.wave.toAssign).toBe(WAVE / 3)
      expect(warmUp.wave.team).toHaveLength(OPERATORS + 1)
      const times: number[] = []
      for (let i = 0; i < 3; i++) times.push((await readOnce()).ms)
      times.sort((a, b) => a - b)
      console.info(
        `read of a Wave of ${WAVE} customers, ${OPERATORS} operators: median ${Math.round(times[1]!)} ms`,
        times.map((ms) => Math.round(ms))
      )
    }, 120_000)
  }
)
