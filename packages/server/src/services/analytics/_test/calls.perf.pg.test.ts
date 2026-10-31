import { Effect, Exit, Layer, Scope } from "effect"
import { HttpApiTest } from "effect/http-api"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { inMemoryPlatform } from "@mito/contract/testing"
import { comparisonOf, presetRange } from "@mito/domain/analytics/window"
import { romeDay } from "@mito/domain/contact/time"
import { serverLayer } from "@mito/server/effect/server"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"
import { createCustomer, createOperator } from "@/test/factories"
import { apiHandlersLayer } from "../../../http/api"
import { SessionReader } from "../../../http/session"

// The calls of the analysis page on 25 months of log (AC12, AC16, AC18):
// 100,000 changes of state spread over ~760 days, on 30 operators, answered in
// under 500 ms (median of 10 requests after a warm-up) for «Gli ultimi 12
// mesi» against the year before, middlewares included, as `export.callStats`
// (AC21 of the calls export). It depends on the machine, so it runs only on
// request: PERF=1 pnpm test:pg

const ROWS = 100_000
const OPERATORS = 30
const DAYS = 760

/** The client of the group `analytics` on the real handlers, as `userId` */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["analytics"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(
      Layer.succeed(SessionReader)({
        read: () =>
          Effect.succeed({
            user: { id: userId },
            expires: "2099-01-01T00:00:00.000Z",
          }),
      })
    ),
    Effect.provide(inMemoryPlatform),
    Effect.provide(serverLayer)
  )

/**
 * The client as `userId`, built once: its layers live in `scope` until the
 * file ends, so the runs measure the requests and not the building of the
 * server
 */
const buildClient = (scope: Scope.Closeable, userId: string) =>
  Effect.runPromise(clientAs(userId).pipe(Scope.provide(scope)))

/** The median of 10 runs of `run` after a warm-up that returns its answer */
async function medianOf<A>(name: string, run: () => Promise<A>) {
  const warmUp = await run()
  const times: number[] = []
  for (let i = 0; i < 10; i++) {
    const started = performance.now()
    await run()
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  const median = (times[4]! + times[5]!) / 2
  console.info(`${name}: median ${median.toFixed(1)} ms`, times)
  return { warmUp, median }
}

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "le chiamate della pagina analisi su 25 mesi di log",
  () => {
    let admin: Awaited<ReturnType<typeof createOperator>>
    let operator: Awaited<ReturnType<typeof createOperator>>
    let adminApi: Awaited<ReturnType<typeof buildClient>>
    let operatorApi: Awaited<ReturnType<typeof buildClient>>
    const scope = Effect.runSync(Scope.make())

    beforeAll(async () => {
      await migrateUpTo()
      admin = await createOperator({ role: "ADMIN" })
      const operators = await Promise.all(
        Array.from({ length: OPERATORS }, (_, i) =>
          createOperator({ surname: `Operatore ${i}` })
        )
      )
      operator = operators[0]!
      const customer = await createCustomer()
      const ids = operators.map((operator) => operator.id)
      // Spread over the last 760 days, with every kind of call and some rows
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
               now() - (g % ${DAYS}) * interval '1 day' - (g % 1440) * interval '1 minute'
        FROM generate_series(1, ${ROWS}) AS g`
      await pgClient`ANALYZE "mito-deutsche_task_event_log"`
      adminApi = await buildClient(scope, admin.userId)
      operatorApi = await buildClient(scope, operator.userId)
    }, 120_000)

    afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)))

    const window = presetRange("12m", romeDay(new Date()))
    const query = {
      from: window.from,
      to: window.to,
      compare: "last-year",
    } as const

    it("calls-by-operator answers in under 500 ms, median of 10 requests", async () => {
      const { warmUp, median } = await medianOf(
        "analytics.callsByOperator",
        () =>
          Effect.runPromise(
            Effect.scoped(adminApi.analytics.getCallsByOperator({ query }))
          )
      )

      // The warm-up also proves the query counts the seed
      expect(warmUp.rows).toHaveLength(OPERATORS)
      expect(warmUp.comparison).toStrictEqual(comparisonOf(window, "last-year"))
      expect(warmUp.comparisonTotals?.calls).toBeGreaterThan(0)
      expect(median).toBeLessThan(500)
    })

    it("my-call-series answers in under 500 ms, median of 10 requests", async () => {
      const { warmUp, median } = await medianOf("analytics.myCallSeries", () =>
        Effect.runPromise(
          Effect.scoped(operatorApi.analytics.getMyCallSeries({ query }))
        )
      )

      expect(warmUp.days.length).toBeGreaterThan(0)
      expect(warmUp.comparisonDays.length).toBeGreaterThan(0)
      expect(median).toBeLessThan(500)
    })
  }
)
