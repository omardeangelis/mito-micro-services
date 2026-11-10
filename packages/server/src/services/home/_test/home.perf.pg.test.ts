import { beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { serverLayer } from "@mito/server/effect/server"
import { latestWaves } from "../latestWaves"
import { getTeamDetail } from "../teamDetail"
import { getTeamDay } from "../teamDay"
import { createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"

// The time of the reads of the admin's home (spec home-admin, Constraints) at
// the volumes of production: 4 Waves of 9,100 customers, 15 operators with
// about 2,850 contacts to call each, a backlog of old alerts, the day of the
// team and two months of calls on customers outside the Waves, so the Waves
// have never called customers, the hardest case of `customerTouched`. It
// depends on the machine, so it runs only on request: PERF=1 pnpm test:pg

const WAVES = 4
const WAVE = 9_100
/** Customers of the CRM outside the Waves, each with an active contact */
const OTHERS = 45_000
const OPERATORS = 15
/** Calls in the log, over the 60 days before today */
const CALLS = 60_000
/** Calls of the team today */
const TODAY = 400
/** Open alerts already overdue, on as many contacts */
const OVERDUE = 3_000

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "letture della home dell'admin ai volumi di produzione",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
      const admin = await createOperator({ role: "ADMIN" })
      const team: number[] = []
      for (let i = 0; i < OPERATORS; i++) {
        team.push((await createOperator({ name: `Op${i}` })).id)
      }
      const total = WAVES * WAVE + OTHERS
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, name, surname, operator_id)
        SELECT 'c' || g, 't' || g, 'h' || g, 'inbound', 'MARIO', 'ROSSI',
               CASE WHEN g < ${WAVES * WAVE} AND g % 3 = 0 THEN NULL
                    ELSE (${team}::int[])[1 + g % ${OPERATORS}] END
        FROM generate_series(0, ${total - 1}) AS g`
      for (let wave = 0; wave < WAVES; wave++) {
        const [run] = await pgClient<{ id: number }[]>`
          INSERT INTO "mito-deutsche_import_run"
            (started_by, file_name, format, status, rows_total, rows_discarded,
             deadline, finished_at)
          VALUES (${admin.userId}, ${`perf${wave}.xlsx`}, 'wave', 'completed',
                  ${WAVE}, 0, (now() + interval '20 days')::date,
                  now() - ${wave} * interval '1 day')
          RETURNING id`
        await pgClient`
          INSERT INTO "mito-deutsche_import_run_customer" (run_id, customer_id, created)
          SELECT ${run!.id}, 'c' || g, true
          FROM generate_series(${wave * WAVE}::int, ${(wave + 1) * WAVE - 1}::int) AS g`
      }
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
      // Overdue alerts, from 1 to 30 days late
      await pgClient`
        WITH picked AS (
          SELECT id, row_number() OVER (ORDER BY id) AS g
          FROM "mito-deutsche_task"
          WHERE is_active AND state = 'richiamare'
          LIMIT ${OVERDUE}
        ), created AS (
          INSERT INTO "mito-deutsche_alert" (task_id, deadline, message)
          SELECT id, now() - ((g % 30) + 1) * interval '1 day', 'Richiamare'
          FROM picked
          RETURNING id, task_id
        )
        UPDATE "mito-deutsche_task" AS t SET alert_id = created.id
        FROM created WHERE t.id = created.task_id`
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, outcome, origin, created_at)
        SELECT 'c' || (${WAVES * WAVE} + g % ${OTHERS}), (${team}::int[])[1 + g % ${OPERATORS}],
               'call', 'list', 'non risponde', 'list',
               now() - ((g % 60) + 1) * interval '1 day'
        FROM generate_series(0, ${CALLS - 1}) AS g`
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, outcome, origin, created_at)
        SELECT 'c' || (g * 7), (${team}::int[])[1 + g % ${OPERATORS}],
               'call', 'list', 'non risponde', 'list', now() - interval '1 minute'
        FROM generate_series(0, ${TODAY - 1}) AS g`
      await pgClient`ANALYZE`
    }, 600_000)

    const median = async <A>(read: Effect.Effect<A, unknown, never>) => {
      await Effect.runPromise(read)
      const times: number[] = []
      for (let i = 0; i < 3; i++) {
        const started = performance.now()
        await Effect.runPromise(read)
        times.push(performance.now() - started)
      }
      times.sort((a, b) => a - b)
      return Math.round(times[1]!)
    }

    it("annota la mediana di 3 letture dopo un riscaldamento", async () => {
      const waves = await median(
        latestWaves().pipe(Effect.provide(serverLayer))
      )
      const detail = await median(
        getTeamDetail().pipe(Effect.provide(serverLayer))
      )
      const day = await median(getTeamDay().pipe(Effect.provide(serverLayer)))
      console.info(
        `home of the admin: getLatestWaves ${waves} ms, getTeamDetail ${detail} ms, getTeamDay ${day} ms`
      )
      const read = await Effect.runPromise(
        latestWaves().pipe(Effect.provide(serverLayer))
      )
      expect(read.rows.map(({ customers }) => customers)).toEqual(
        Array.from({ length: WAVES }, () => WAVE)
      )
      expect(read.neverCalledDistinct).toBeGreaterThan(0)
      const { members } = await Effect.runPromise(
        getTeamDetail().pipe(Effect.provide(serverLayer))
      )
      expect(members.reduce((sum, m) => sum + m.calls, 0)).toBe(TODAY)
      expect(members.reduce((sum, m) => sum + m.overdue.total, 0)).toBe(OVERDUE)
    }, 300_000)
  }
)
