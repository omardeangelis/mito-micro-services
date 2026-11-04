import { beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { serverLayer } from "@mito/server/effect/server"
import { assignWave } from "../assign"
import { createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"

// The time of «Assegna» of a Wave (T7, D17) at the volume of the plan: 5,000
// customers without an operator to 15 people, in a Wave of 9,000 inside a CRM
// of 39,000 customers with their contacts. It depends on the machine, so it
// runs only on request: PERF=1 pnpm test:pg

const WAVE = 9_000
const TO_ASSIGN = 5_000
/** Customers of the CRM outside the Wave, each with an active contact */
const OTHERS = 30_000
const OPERATORS = 15
/** A tenth of the customers to assign have an active contact without operator */
const ORPHANS = TO_ASSIGN / 10

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "assegnazione di 5.000 clienti di una Wave a 15 persone (D17)",
  () => {
    let runId = 0
    let adminId = 0
    const team: number[] = []

    beforeAll(async () => {
      await migrateUpTo()
      const admin = await createOperator({ role: "ADMIN" })
      adminId = admin.id
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

      // The first TO_ASSIGN customers of the Wave without an operator, the
      // rest spread over the team
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, name, surname, operator_id, created_at)
        SELECT 'c' || g, 't' || g, 'h' || g, 'inbound', 'MARIO', 'ROSSI',
               CASE WHEN g < ${TO_ASSIGN} THEN NULL
                    ELSE (${team}::int[])[1 + g % ${OPERATORS}] END,
               now() - g * interval '1 minute'
        FROM generate_series(0, ${WAVE + OTHERS - 1}) AS g`
      await pgClient`
        INSERT INTO "mito-deutsche_import_run_customer" (run_id, customer_id, created)
        SELECT ${runId}, 'c' || g, g % 2 = 0
        FROM generate_series(0, ${WAVE - 1}) AS g`
      await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active, priority)
        SELECT c.id, c.operator_id, 'chiamare', true, 120
        FROM "mito-deutsche_customers" AS c
        WHERE c.operator_id IS NOT NULL`
      await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active, priority)
        SELECT 'c' || g, NULL, 'non risponde', true, 100
        FROM generate_series(0, ${ORPHANS - 1}) AS g`
      await pgClient`ANALYZE`
    }, 300_000)

    it("annota il tempo dell'assegnazione e resta sotto i 60 s", async () => {
      const each = Math.floor(TO_ASSIGN / OPERATORS)
      const receivers = team.map((operatorId, i) => ({
        operatorId,
        count: i === 0 ? TO_ASSIGN - each * (OPERATORS - 1) : each,
      }))

      const started = performance.now()
      const result = await Effect.runPromise(
        assignWave({
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: adminId,
          receivers,
        }).pipe(Effect.provide(serverLayer))
      )
      const ms = performance.now() - started

      expect(result.assigned).toBe(TO_ASSIGN)
      expect(result.remaining).toBe(0)
      const [left] = await pgClient<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "mito-deutsche_customers"
        WHERE id IN (SELECT customer_id FROM "mito-deutsche_import_run_customer")
          AND operator_id IS NULL`
      expect(left!.n).toBe(0)
      console.info(
        `assign of ${TO_ASSIGN} customers (${ORPHANS} with an active contact) to ${OPERATORS} people: ${Math.round(ms)} ms`
      )
      expect(ms).toBeLessThan(60_000)
    }, 120_000)
  }
)
