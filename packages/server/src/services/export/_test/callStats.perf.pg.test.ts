import { beforeAll, describe, expect, it } from "vitest"
import { selectableDays } from "@mito/domain/export/period"
import { createTestCaller } from "@/test/caller"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"
import { createCustomer, createOperator } from "@/test/factories"

// AC21 of the calls export: 100,000 changes of state in the period, on 30
// operators, answered in under 500 ms (median of 10 requests after a warm-up),
// middlewares included. It depends on the machine, so it runs only on request:
// PERF=1 pnpm test:pg

const ROWS = 100_000
const OPERATORS = 30

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "export.callStats on 100,000 changes (AC21)",
  () => {
    let admin: Awaited<ReturnType<typeof createOperator>>

    beforeAll(async () => {
      await migrateUpTo()
      admin = await createOperator({ role: "ADMIN" })
      const operators = await Promise.all(
        Array.from({ length: OPERATORS }, (_, i) =>
          createOperator({ surname: `Operatore ${i}` })
        )
      )
      const customer = await createCustomer()
      const ids = operators.map((operator) => operator.id)
      // Spread over the last 90 days, with every kind of call and some rows
      // that are not calls
      await pgClient`
        INSERT INTO "mito-deutsche_task_event_log"
          (customer_id, actor_operator_id, action, source, from_state, to_state, created_at)
        SELECT ${customer.id},
               (${ids}::int[])[1 + g % ${OPERATORS}],
               'state_change',
               (ARRAY['list', 'detail', 'bulk'])[1 + (g / 7) % 3]::task_event_source,
               (ARRAY['chiamare', 'richiamare', 'app.to'])[1 + (g / 11) % 3]::task_status,
               (ARRAY['app.to', 'non risponde', 'richiamare', 'caricato'])[1 + g % 4]::task_status,
               now() - (g % 90) * interval '1 day' - (g % 1440) * interval '1 minute'
        FROM generate_series(1, ${ROWS}) AS g`
      await pgClient`ANALYZE "mito-deutsche_task_event_log"`
    }, 120_000)

    it("answers in under 500 ms, median of 10 requests", async () => {
      const { first, last } = selectableDays(new Date())
      const caller = createTestCaller(admin)
      const period = { from: first, to: last }

      // The warm-up also proves the query counts the seed, so a query that
      // returns nothing can't pass on speed alone.
      const warmUp = await caller.export.callStats(period)
      expect(warmUp.rows).toHaveLength(30)
      expect(warmUp.totals.calls).toBeGreaterThan(0)
      const times: number[] = []
      for (let i = 0; i < 10; i++) {
        const started = performance.now()
        await caller.export.callStats(period)
        times.push(performance.now() - started)
      }
      times.sort((a, b) => a - b)
      const median = (times[4]! + times[5]!) / 2
      console.info(`export.callStats: median ${median.toFixed(1)} ms`, times)

      expect(median).toBeLessThan(500)
    })
  }
)
