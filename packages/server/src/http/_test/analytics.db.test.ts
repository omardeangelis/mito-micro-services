import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpRouter } from "effect/http"
import { HttpApiBuilder, HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach, onTestFinished } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { InvalidPeriod, NotAdmin } from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { serverLayer } from "@mito/server/effect/server"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
  createTask,
  createTaskEvent,
} from "@/test/factories"
import { contactProgress } from "../../services/analytics/contactProgress"
import {
  financedAverage,
  financedByBranch,
  financedTotal,
} from "../../services/analytics/financed"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints of the dashboard home: the cards of `analytics` and the
// calls of `export`, on the real handlers and database. What each number
// counts is in the tests of the services and of the procedures: here, that
// each endpoint gives what its service gives, with the procedure's default
// and guard

/** The session the backend read for the request: `userId`'s */
const sessionOf = (userId: string) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed({
        user: { id: userId },
        expires: "2099-01-01T00:00:00.000Z",
      }),
  })

/** The client of the groups `analytics` and `export`, on the real handlers */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["analytics", "export"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

/**
 * The status of a GET the backend receives as it is, with no client to
 * encode it: what the server itself rejects
 */
const statusOf = (userId: string, path: string) =>
  Effect.promise(async () => {
    const web = HttpRouter.toWebHandler(
      HttpApiBuilder.layer(MitoApi).pipe(
        Layer.provide(apiHandlersLayer),
        Layer.provide(sessionOf(userId)),
        Layer.provide(serverLayer),
        Layer.provide(inMemoryPlatform)
      ),
      { disableLogger: true }
    )
    onTestFinished(() => web.dispose())
    const response = await web.handler(
      new Request(`http://localhost/api/v1${path}`)
    )
    return response.status
  })

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

// 23 October 2026, 12:00 in Rome: the days of the calls export are 24/07–23/10
const NOW = new Date("2026-10-23T10:00:00.000Z")
const DAY = 86_400_000

/** An admin and an operator, each with a customer and a financed practice */
const twoOperators = Effect.gen(function* () {
  yield* TestClock.setTime(NOW.getTime())
  const admin = yield* given(() => createOperator({ role: "ADMIN" }))
  const operator = yield* given(() => createOperator())
  for (const [owner, amount, branch] of [
    [admin, "4000", "Roma"],
    [operator, "1000", "Milano"],
  ] as const) {
    const customer = yield* given(() =>
      createCustomer({ operatorId: owner.id })
    )
    yield* given(() =>
      createPractice({
        customerId: customer.id,
        importoFinanziato: amount,
        desPuntoVendita: branch,
        // 10 days ago: in the reference window of every time frame
        dataLiquidazione: new Date(NOW.getTime() - 10 * DAY),
      })
    )
    // 40 days ago: in the comparison window of 30 days only
    yield* given(() =>
      createPractice({
        customerId: customer.id,
        importoFinanziato: amount,
        desPuntoVendita: branch,
        dataLiquidazione: new Date(NOW.getTime() - 40 * DAY),
      })
    )
  }
  return { admin, operator }
})

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/analytics/financed-total e financed-average", () => {
  it.effect(
    "senza periodo danno i 30 giorni del servizio, con le finestre",
    () =>
      Effect.gen(function* () {
        const { operator } = yield* twoOperators
        const api = yield* clientAs(operator.userId)
        const actor = { operatorId: operator.id, role: operator.role }

        const total = yield* api.analytics.getFinancedTotal({ query: {} })
        const average = yield* api.analytics.getFinancedAverage({ query: {} })

        assert.deepStrictEqual(
          total,
          yield* financedTotal({ timeFrame: "30d", actor }).pipe(provideServer)
        )
        assert.deepStrictEqual(
          average,
          yield* financedAverage({ timeFrame: "30d", actor }).pipe(
            provideServer
          )
        )
        // The operator's practices only, one per window
        assert.strictEqual(total.reference, 1000)
        assert.strictEqual(total.comparison, 1000)
        // The windows of the server's clock, as dates
        assert.deepStrictEqual(total.windows.reference.end, NOW)
        assert.deepStrictEqual(
          total.windows.comparison.end,
          new Date(NOW.getTime() - 30 * DAY)
        )
      })
  )

  it.effect("con un periodo contano su quello, e l'admin conta tutti", () =>
    Effect.gen(function* () {
      const { admin } = yield* twoOperators
      const api = yield* clientAs(admin.userId)

      const total = yield* api.analytics.getFinancedTotal({
        query: { timeFrame: "90d" },
      })

      // Both practices of both operators in the 90 days, none before
      assert.strictEqual(total.reference, 10_000)
      assert.strictEqual(total.comparison, 0)
    })
  )

  it.effect("un periodo che non esiste il server lo rifiuta", () =>
    Effect.gen(function* () {
      const { operator } = yield* twoOperators

      assert.strictEqual(
        yield* statusOf(
          operator.userId,
          "/analytics/financed-total?timeFrame=7d"
        ),
        400
      )
    })
  )
})

describe("GET /api/v1/analytics/financed-by-branch", () => {
  it.effect("dà all'admin il finanziato di ogni punto vendita", () =>
    Effect.gen(function* () {
      const { admin } = yield* twoOperators
      const api = yield* clientAs(admin.userId)

      const branches = yield* api.analytics.getFinancedByBranch({
        query: { timeFrame: "30d" },
      })

      assert.deepStrictEqual(
        branches,
        yield* financedByBranch({ timeFrame: "30d" }).pipe(provideServer)
      )
      assert.deepStrictEqual(branches, [
        { data: "Milano", total: 1000 },
        { data: "Roma", total: 4000 },
      ])
    })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      const { operator } = yield* twoOperators
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.analytics.getFinancedByBranch({ query: {} })
      )

      assert.instanceOf(error, NotAdmin)
    })
  )
})

describe("GET /api/v1/analytics/contact-progress", () => {
  it.effect("dà i contatti con esito e da chiamare di chi chiama", () =>
    Effect.gen(function* () {
      const { admin, operator } = yield* twoOperators
      yield* given(() =>
        createTask({ operatorId: operator.id, state: "app.to" })
      )
      yield* given(() =>
        createTask({ operatorId: operator.id, state: "chiamare" })
      )
      yield* given(() =>
        createTask({ operatorId: admin.id, state: "chiamare" })
      )

      const mine = yield* (yield* clientAs(
        operator.userId
      )).analytics.getContactProgress()
      const all = yield* (yield* clientAs(
        admin.userId
      )).analytics.getContactProgress()

      assert.deepStrictEqual(mine, { done: 1, todo: 1 })
      assert.deepStrictEqual(
        all,
        yield* contactProgress({
          actor: { operatorId: admin.id, role: "ADMIN" },
        }).pipe(provideServer)
      )
      assert.deepStrictEqual(all, { done: 1, todo: 2 })
    })
  )
})

describe("GET /api/v1/export/call-stats", () => {
  const PERIOD = { from: "2026-10-01", to: "2026-10-02" }

  it.effect("dà all'admin le chiamate di ogni operatore nel periodo", () =>
    Effect.gen(function* () {
      const { admin, operator } = yield* twoOperators
      yield* given(() =>
        createTaskEvent({
          actorOperatorId: operator.id,
          toState: "non risponde",
          createdAt: new Date("2026-10-01T10:00:00.000Z"),
        })
      )
      // The day after the period, in Rome
      yield* given(() =>
        createTaskEvent({
          actorOperatorId: operator.id,
          createdAt: new Date("2026-10-02T22:30:00.000Z"),
        })
      )
      const api = yield* clientAs(admin.userId)

      const stats = yield* api.export.callStats({ query: PERIOD })

      assert.deepStrictEqual(stats, {
        rows: [
          {
            operatorId: operator.id,
            name: "Mario",
            surname: operator.surname ?? "",
            calls: 1,
            answered: 0,
            appointments: 0,
            noAnswer: 1,
          },
        ],
        totals: { calls: 1, answered: 0, appointments: 0, noAnswer: 1 },
      })
    })
  )

  const INVALID: ReadonlyArray<
    readonly [string, { readonly from: string; readonly to: string }]
  > = [
    ["un giorno che non esiste", { from: "2026-02-30", to: "2026-10-02" }],
    ["un periodo rovesciato", { from: "2026-10-02", to: "2026-10-01" }],
    [
      "un giorno più vecchio di 3 mesi",
      { from: "2026-07-23", to: "2026-10-01" },
    ],
    ["un giorno dopo oggi", { from: "2026-10-01", to: "2026-10-24" }],
  ]

  it.effect.each(INVALID)("%s è InvalidPeriod", ([, period]) =>
    Effect.gen(function* () {
      const { admin } = yield* twoOperators
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(api.export.callStats({ query: period }))

      assert.instanceOf(error, InvalidPeriod)
    })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      const { operator } = yield* twoOperators
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(api.export.callStats({ query: PERIOD }))

      assert.instanceOf(error, NotAdmin)
    })
  )
})
