import { beforeAll, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { serverLayer } from "@mito/server/effect/server"
import { move, moveCandidates } from "../move"
import { createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"

// The time of «Sposta» of a Wave (T8, D17) at the volume of the plan: 5,000
// contacts from 3 people to 12, in a Wave of 9,000 inside a CRM of 39,000
// customers with their contacts. It depends on the machine, so it runs only on
// request: PERF=1 pnpm test:pg

const WAVE = 9_000
/** Customers of the CRM outside the Wave, each with an active contact */
const OTHERS = 30_000
const GIVERS = 3
const RECEIVERS = 12
const TO_MOVE = 5_000

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "spostamento di 5.000 contatti di una Wave da 3 persone a 12 (D17)",
  () => {
    let runId = 0
    let adminId = 0
    const givers: number[] = []
    const receivers: number[] = []

    beforeAll(async () => {
      await migrateUpTo()
      const admin = await createOperator({ role: "ADMIN" })
      adminId = admin.id
      for (let i = 0; i < GIVERS; i++) {
        givers.push((await createOperator({ name: `Giver${i}` })).id)
      }
      for (let i = 0; i < RECEIVERS; i++) {
        receivers.push((await createOperator({ name: `Op${i}` })).id)
      }
      const team = [...givers, ...receivers]
      const [run] = await pgClient<{ id: number }[]>`
        INSERT INTO "mito-deutsche_import_run"
          (started_by, file_name, format, status, rows_total, rows_discarded, deadline)
        VALUES (${admin.userId}, 'perf.xlsx', 'wave', 'completed', ${WAVE}, 0,
                (now() + interval '20 days')::date)
        RETURNING id`
      runId = run!.id

      // The Wave's customers spread over the givers, the others over the team
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, name, surname, operator_id, created_at)
        SELECT 'c' || g, 't' || g, 'h' || g, 'inbound', 'MARIO', 'ROSSI',
               CASE WHEN g < ${WAVE} THEN (${givers}::int[])[1 + g % ${GIVERS}]
                    ELSE (${team}::int[])[1 + g % ${team.length}] END,
               now() - g * interval '1 minute'
        FROM generate_series(0, ${WAVE + OTHERS - 1}) AS g`
      await pgClient`
        INSERT INTO "mito-deutsche_import_run_customer" (run_id, customer_id, created)
        SELECT ${runId}, 'c' || g, g % 2 = 0
        FROM generate_series(0, ${WAVE - 1}) AS g`
      // A third of the contacts in Non risponde, the rest Da chiamare
      await pgClient`
        INSERT INTO "mito-deutsche_task"
          (customer_id, operator_id, state, is_active, priority, created_at)
        SELECT c.id, c.operator_id,
               CASE WHEN abs(hashtext(c.id)) % 3 = 0 THEN 'non risponde'
                    ELSE 'chiamare' END::task_status,
               true, 120, c.created_at
        FROM "mito-deutsche_customers" AS c`
      await pgClient`ANALYZE`
    }, 300_000)

    it("annota il tempo dello spostamento e resta sotto i 60 s", async () => {
      const { candidates } = await Effect.runPromise(
        moveCandidates(runId, givers).pipe(Effect.provide(serverLayer))
      )
      // The first contacts of each giver, a third each, as the client sends
      const each = Math.ceil(TO_MOVE / GIVERS)
      const contacts = candidates.map((giver, i) => ({
        fromOperatorId: giver.operatorId,
        taskIds: giver.contacts
          .slice(0, i === 0 ? TO_MOVE - each * (GIVERS - 1) : each)
          .map((contact) => contact.taskId),
      }))
      const total = contacts.reduce(
        (sum, giver) => sum + giver.taskIds.length,
        0
      )
      expect(total).toBe(TO_MOVE)
      const share = Math.floor(TO_MOVE / RECEIVERS)
      const counts = receivers.map((operatorId, i) => ({
        operatorId,
        count: i === 0 ? TO_MOVE - share * (RECEIVERS - 1) : share,
      }))

      const started = performance.now()
      const result = await Effect.runPromise(
        move({
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: adminId,
          which: "both",
          strategy: "pace",
          contacts,
          receivers: counts,
        }).pipe(Effect.provide(serverLayer))
      )
      const ms = performance.now() - started

      expect(result.moved).toBe(TO_MOVE)
      expect(result.skipped).toBe(0)
      const [left] = await pgClient<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "mito-deutsche_task"
        WHERE is_active AND operator_id = ANY(${receivers}::int[])
          AND customer_id IN (SELECT customer_id FROM "mito-deutsche_import_run_customer")`
      expect(left!.n).toBe(TO_MOVE)
      console.info(
        `move of ${TO_MOVE} contacts from ${GIVERS} to ${RECEIVERS} people: ${Math.round(ms)} ms`
      )
      expect(ms).toBeLessThan(60_000)
    }, 120_000)
  }
)
