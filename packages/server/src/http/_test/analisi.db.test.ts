import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpRouter } from "effect/http"
import { HttpApiBuilder, HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach, onTestFinished } from "vitest"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { db } from "@mito/db"
import { practices } from "@mito/db/schema/pratiche"
import { MitoApi } from "@mito/contract/api"
import { InvalidWindow, NotAdmin, Unauthorized } from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { periodBounds } from "@mito/domain/export/period"
import { serverLayer } from "@mito/server/effect/server"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
  createTaskEvent,
} from "@/test/factories"
import { callStats } from "../../services/export/callStats"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints of the analysis page (brain/specs/crm/pagina-analisi), on the
// real handlers and database: windows of Rome days, the comparison the server
// computes, and who sees what

/** The session the backend read for the request: `userId`'s */
const sessionOf = (userId: string) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed({
        user: { id: userId },
        expires: "2099-01-01T00:00:00.000Z",
      }),
  })

/** The client of the group `analytics`, on the real handlers */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["analytics"]).pipe(
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

// 30 October 2026, 12:00 in Rome (UTC+1): the day of the examples of the spec
const NOW = new Date("2026-10-30T11:00:00.000Z")

/** A financed practice no customer holds */
const orphanPractice = (values: Partial<typeof practices.$inferInsert> = {}) =>
  given(async () => {
    const [practice] = await db
      .insert(practices)
      .values({
        praticaId: `orfana-${Math.random().toString(36).slice(2)}`,
        importoFinanziato: "2500",
        importoErogato: "2500",
        rateTotali: 60,
        importoRata: "50",
        ratePagate: 0,
        dataLiquidazione: new Date("2026-10-12T10:00:00.000Z"),
        state: "Liquidata",
        ...values,
      })
      .returning()
    return practice!
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/analytics/financed-series", () => {
  it.effect(
    "dà all'admin anche le pratiche senza clienti, con il confronto del periodo precedente (AC5, AC10)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        yield* orphanPractice()
        const api = yield* clientAs(admin.userId)

        const series = yield* api.analytics.getFinancedSeries({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "previous" },
        })

        assert.deepStrictEqual(series.window, {
          from: "2026-10-01",
          to: "2026-10-30",
        })
        assert.deepStrictEqual(series.comparison, {
          from: "2026-09-01",
          to: "2026-09-30",
        })
        assert.deepStrictEqual(series.days, [
          { day: "2026-10-12", practices: 1, amount: 2500 },
        ])
        assert.deepStrictEqual(series.comparisonDays, [])
      })
  )

  it.effect(
    "conta solo le pratiche dei clienti dell'operatore, una volta ciascuna (AC6)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const me = yield* given(() => createOperator())
        const other = yield* given(() => createOperator())
        const mine = yield* given(() => createCustomer({ operatorId: me.id }))
        const mineToo = yield* given(() =>
          createCustomer({ operatorId: me.id })
        )
        const theirs = yield* given(() =>
          createCustomer({ operatorId: other.id })
        )
        const shared = yield* given(() =>
          createPractice({
            customerId: mine.id,
            importoFinanziato: "1000",
            dataLiquidazione: new Date("2026-10-12T10:00:00.000Z"),
          })
        )
        // Two of my customers hold it: one practice
        yield* given(() =>
          db.insert(customerToPratica).values({
            customerId: mineToo.id,
            praticaId: shared.praticaId,
            customerRole: "Coobbligato",
          })
        )
        yield* given(() =>
          createPractice({
            customerId: theirs.id,
            importoFinanziato: "9000",
            dataLiquidazione: new Date("2026-10-12T10:00:00.000Z"),
          })
        )
        yield* orphanPractice()
        // In September, the comparison: mine, theirs and one nobody holds
        yield* given(() =>
          createPractice({
            customerId: mine.id,
            importoFinanziato: "300",
            dataLiquidazione: new Date("2026-09-10T10:00:00.000Z"),
          })
        )
        yield* given(() =>
          createPractice({
            customerId: theirs.id,
            importoFinanziato: "7000",
            dataLiquidazione: new Date("2026-09-10T10:00:00.000Z"),
          })
        )
        yield* orphanPractice({
          dataLiquidazione: new Date("2026-09-10T10:00:00.000Z"),
        })
        const api = yield* clientAs(me.userId)

        const series = yield* api.analytics.getFinancedSeries({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "previous" },
        })

        assert.deepStrictEqual(series.days, [
          { day: "2026-10-12", practices: 1, amount: 1000 },
        ])
        assert.deepStrictEqual(series.comparisonDays, [
          { day: "2026-09-10", practices: 1, amount: 300 },
        ])
      })
  )

  it.effect("il giorno di una pratica è il giorno di Roma (A1)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      // 23:30 UTC of the 14th is 01:30 of the 15th in Rome
      yield* orphanPractice({
        importoFinanziato: "100",
        dataLiquidazione: new Date("2026-10-14T23:30:00.000Z"),
      })
      yield* orphanPractice({
        importoFinanziato: "200",
        dataLiquidazione: new Date("2026-10-15T08:00:00.000Z"),
      })
      yield* orphanPractice({
        importoFinanziato: "50",
        dataLiquidazione: new Date("2026-10-13T08:00:00.000Z"),
      })
      const api = yield* clientAs(admin.userId)

      const series = yield* api.analytics.getFinancedSeries({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
      })

      assert.deepStrictEqual(series.days, [
        { day: "2026-10-13", practices: 1, amount: 50 },
        { day: "2026-10-15", practices: 2, amount: 300 },
      ])
    })
  )

  it.effect("le pratiche non finanziate non contano", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      for (const state of ["Rifiutata", "Rinunciata", "Stornata"] as const) {
        yield* orphanPractice({ state })
      }
      yield* orphanPractice({
        state: "Estinta anticipata",
        importoFinanziato: "70",
      })
      const api = yield* clientAs(admin.userId)

      const series = yield* api.analytics.getFinancedSeries({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
      })

      assert.deepStrictEqual(series.days, [
        { day: "2026-10-12", practices: 1, amount: 70 },
      ])
    })
  )

  it.effect("il confronto è dell'anno prima, o nessuno", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      yield* orphanPractice({
        importoFinanziato: "800",
        dataLiquidazione: new Date("2025-10-05T10:00:00.000Z"),
      })
      const api = yield* clientAs(admin.userId)

      const lastYear = yield* api.analytics.getFinancedSeries({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "last-year" },
      })
      const none = yield* api.analytics.getFinancedSeries({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
      })

      assert.deepStrictEqual(lastYear.comparison, {
        from: "2025-10-01",
        to: "2025-10-30",
      })
      assert.deepStrictEqual(lastYear.comparisonDays, [
        { day: "2025-10-05", practices: 1, amount: 800 },
      ])
      assert.strictEqual(none.comparison, null)
      assert.deepStrictEqual(none.comparisonDays, [])
    })
  )

  it.effect(
    "un `to` di domani è accorciato a oggi, anche per il confronto (D7)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)

        const series = yield* api.analytics.getFinancedSeries({
          query: { from: "2026-10-01", to: "2026-10-31", compare: "previous" },
        })

        assert.deepStrictEqual(series.window, {
          from: "2026-10-01",
          to: "2026-10-30",
        })
        assert.deepStrictEqual(series.comparison, {
          from: "2026-09-01",
          to: "2026-09-30",
        })
      })
  )

  it.effect(
    "oggi e gli estremi della finestra sono giorni di Roma, anche dopo la sua mezzanotte (AC9, D7)",
    () =>
      Effect.gen(function* () {
        // 00:30 of 31 October in Rome, still the 30th in UTC
        yield* TestClock.setTime(new Date("2026-10-30T23:30:00.000Z").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        // 00:30 of 1 October in Rome: in the window, not in the comparison
        yield* orphanPractice({
          importoFinanziato: "40",
          dataLiquidazione: new Date("2026-09-30T22:30:00.000Z"),
        })
        const api = yield* clientAs(admin.userId)

        // Tomorrow in Rome is 1 November: shortened to today, the 31st
        const series = yield* api.analytics.getFinancedSeries({
          query: { from: "2026-10-01", to: "2026-11-01", compare: "previous" },
        })
        assert.deepStrictEqual(series.window, {
          from: "2026-10-01",
          to: "2026-10-31",
        })
        assert.deepStrictEqual(series.days, [
          { day: "2026-10-01", practices: 1, amount: 40 },
        ])
        assert.deepStrictEqual(series.comparisonDays, [])

        const error = yield* Effect.flip(
          api.analytics.getFinancedSeries({
            query: { from: "2026-10-01", to: "2026-11-02", compare: "none" },
          })
        )
        assert.instanceOf(error, InvalidWindow)
      })
  )

  it.effect(
    "una finestra fuori da AC9 è InvalidWindow, giudicata sul giorno di oggi del server (AC14)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)
        const rejected = [
          ["due giorni dopo oggi", { from: "2026-10-01", to: "2026-11-01" }],
          ["367 giorni", { from: "2025-10-29", to: "2026-10-30" }],
          ["rovesciata", { from: "2026-10-20", to: "2026-10-10" }],
          [
            "un giorno che non esiste",
            { from: "2026-02-30", to: "2026-10-10" },
          ],
        ] as const

        for (const [label, window] of rejected) {
          const error = yield* Effect.flip(
            api.analytics.getFinancedSeries({
              query: { ...window, compare: "none" },
            })
          )
          assert.instanceOf(error, InvalidWindow, label)
        }

        // The edge: 366 days is allowed
        const edge = yield* api.analytics.getFinancedSeries({
          query: { from: "2025-10-30", to: "2026-10-30", compare: "none" },
        })
        assert.deepStrictEqual(edge.window, {
          from: "2025-10-30",
          to: "2026-10-30",
        })
      })
  )

  it.effect(
    "il server rifiuta con 400 una query che lo schema non accetta, qualunque sia la data (AC14)",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const path = (query: string) => `/analytics/financed-series?${query}`

        const statuses = yield* Effect.all([
          // Unknown comparison
          statusOf(
            admin.userId,
            path("from=2026-10-01&to=2026-10-10&compare=foo")
          ),
          // Not YYYY-MM-DD
          statusOf(
            admin.userId,
            path("from=1/10/2026&to=2026-10-10&compare=none")
          ),
          statusOf(
            admin.userId,
            path("from=2026-10-01&to=2026-10-3&compare=none")
          ),
          // A parameter missing
          statusOf(admin.userId, path("from=2026-10-01&compare=none")),
        ])

        assert.deepStrictEqual(statuses, [400, 400, 400, 400])
      })
  )

  it.effect(
    "il confronto è calcolato sulla finestra accorciata, non su quella chiesta (D7)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)

        const series = yield* api.analytics.getFinancedSeries({
          query: { from: "2026-10-02", to: "2026-10-31", compare: "previous" },
        })

        // 2 – 30 Oct is 29 days: the 29 days before it. On the 30 days asked
        // for, the comparison would start on the 2nd of September
        assert.deepStrictEqual(series.window, {
          from: "2026-10-02",
          to: "2026-10-30",
        })
        assert.deepStrictEqual(series.comparison, {
          from: "2026-09-03",
          to: "2026-10-01",
        })
      })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* HttpApiTest.groups(MitoApi, ["analytics"]).pipe(
        Effect.provide(apiHandlersLayer),
        Effect.provide(
          Layer.succeed(SessionReader)({ read: () => Effect.succeed(null) })
        ),
        Effect.provide(inMemoryPlatform),
        provideServer
      )

      const error = yield* Effect.flip(
        api.analytics.getFinancedSeries({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
        })
      )

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("GET /api/v1/analytics/branch-totals", () => {
  it.effect(
    "somma per sede quanto la serie del finanziato dell'admin, con la riga senza sede (AC4, AC5)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const customer = yield* given(() =>
          createCustomer({ operatorId: admin.id })
        )
        yield* given(() =>
          createPractice({
            customerId: customer.id,
            importoFinanziato: "1000",
            desPuntoVendita: "Roma",
            dataLiquidazione: new Date("2026-10-05T10:00:00.000Z"),
          })
        )
        yield* given(() =>
          createPractice({
            customerId: customer.id,
            importoFinanziato: "3000",
            desPuntoVendita: "Milano",
            dataLiquidazione: new Date("2026-10-06T10:00:00.000Z"),
          })
        )
        yield* orphanPractice({ desPuntoVendita: null })
        // In September: the comparison of "previous", two points of sale
        yield* orphanPractice({
          importoFinanziato: "1200",
          desPuntoVendita: "Roma",
          dataLiquidazione: new Date("2026-09-10T10:00:00.000Z"),
        })
        yield* orphanPractice({
          importoFinanziato: "300",
          desPuntoVendita: null,
          dataLiquidazione: new Date("2026-09-30T10:00:00.000Z"),
        })
        const api = yield* clientAs(admin.userId)
        const query = {
          from: "2026-10-01",
          to: "2026-10-30",
          compare: "previous",
        } as const

        const branches = yield* api.analytics.getBranchTotals({ query })
        const series = yield* api.analytics.getFinancedSeries({ query })

        const sum = (values: ReadonlyArray<number>) =>
          values.reduce((total, value) => total + value, 0)
        assert.strictEqual(
          sum(branches.rows.map((row) => row.amount)),
          sum(series.days.map((day) => day.amount))
        )
        assert.strictEqual(sum(branches.rows.map((row) => row.amount)), 6500)
        assert.deepStrictEqual(
          branches.rows.find((row) => row.branch === null),
          { branch: null, practices: 1, amount: 2500 }
        )
        assert.deepStrictEqual(branches.comparison, {
          from: "2026-09-01",
          to: "2026-09-30",
        })
        // The total of the comparison is the sum over every point of sale
        assert.strictEqual(branches.comparisonTotal, 1500)
      })
  )

  it.effect("le pratiche non finanziate non sono in nessuna sede", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      yield* orphanPractice({
        importoFinanziato: "400",
        desPuntoVendita: "Roma",
      })
      for (const state of ["Rifiutata", "Rinunciata", "Stornata"] as const) {
        yield* orphanPractice({
          state,
          importoFinanziato: "9000",
          desPuntoVendita: "Milano",
        })
        yield* orphanPractice({
          state,
          importoFinanziato: "9000",
          desPuntoVendita: "Roma",
          dataLiquidazione: new Date("2026-09-10T10:00:00.000Z"),
        })
      }
      const api = yield* clientAs(admin.userId)

      const branches = yield* api.analytics.getBranchTotals({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "previous" },
      })

      assert.deepStrictEqual(branches.rows, [
        { branch: "Roma", practices: 1, amount: 400 },
      ])
      assert.strictEqual(branches.comparisonTotal, 0)
    })
  )

  it.effect(
    "senza confronto non ha né intervallo né totale del confronto",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        yield* orphanPractice({ importoFinanziato: "700" })
        const api = yield* clientAs(admin.userId)

        const branches = yield* api.analytics.getBranchTotals({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
        })

        assert.strictEqual(branches.comparison, null)
        assert.strictEqual(branches.comparisonTotal, null)
        assert.deepStrictEqual(branches.rows, [
          { branch: null, practices: 1, amount: 700 },
        ])
      })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.analytics.getBranchTotals({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
        })
      )

      assert.instanceOf(error, NotAdmin)
    })
  )
})

describe("GET /api/v1/analytics/calls-by-operator e my-call-series", () => {
  it.effect(
    "un operatore non ha le chiamate di tutti, e nelle sue ci sono solo le sue (AC18, D8)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const anna = yield* given(() => createOperator())
        const bruno = yield* given(() => createOperator())
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            createdAt: new Date("2026-10-05T09:00:00.000Z"),
          })
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            toState: "non risponde",
            createdAt: new Date("2026-10-05T10:00:00.000Z"),
          })
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: bruno.id,
            createdAt: new Date("2026-10-07T09:00:00.000Z"),
          })
        )
        // In September: the comparison of "previous", hers and Bruno's
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            toState: "non interessato",
            createdAt: new Date("2026-09-10T09:00:00.000Z"),
          })
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: bruno.id,
            createdAt: new Date("2026-09-10T10:00:00.000Z"),
          })
        )
        const api = yield* clientAs(anna.userId)
        const query = {
          from: "2026-10-01",
          to: "2026-10-30",
          compare: "previous",
        } as const

        const error = yield* Effect.flip(
          api.analytics.getCallsByOperator({ query })
        )
        assert.instanceOf(error, NotAdmin)

        const mine = yield* api.analytics.getMyCallSeries({ query })
        assert.deepStrictEqual(mine.days, [
          {
            day: "2026-10-05",
            calls: 2,
            answered: 1,
            noAnswer: 1,
            appointments: 1,
          },
        ])
        assert.deepStrictEqual(mine.comparison, {
          from: "2026-09-01",
          to: "2026-09-30",
        })
        // Her calls of the comparison, not Bruno's
        assert.deepStrictEqual(mine.comparisonDays, [
          {
            day: "2026-09-10",
            calls: 1,
            answered: 1,
            noAnswer: 0,
            appointments: 0,
          },
        ])
      })
  )

  it.effect(
    "l'admin ha le righe per operatore come l'export dello stesso periodo, e i totali del confronto (AC12, AC16)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const bruno = yield* given(() => createOperator({ surname: "Bruno" }))
        const call = (
          operator: { id: number },
          createdAt: string,
          toState?: "non risponde" | "non interessato"
        ) =>
          given(() =>
            createTaskEvent({
              actorOperatorId: operator.id,
              createdAt: new Date(createdAt),
              ...(toState ? { toState } : {}),
            })
          )
        yield* call(admin, "2026-10-02T09:00:00.000Z")
        yield* call(anna, "2026-10-03T09:00:00.000Z")
        yield* call(bruno, "2026-10-04T09:00:00.000Z")
        yield* call(bruno, "2026-10-05T09:00:00.000Z", "non risponde")
        yield* call(bruno, "2026-10-06T09:00:00.000Z")
        // In September: the comparison of "previous"
        yield* call(anna, "2026-09-10T09:00:00.000Z")
        yield* call(anna, "2026-09-11T09:00:00.000Z", "non risponde")
        // Answered, but no appointment
        yield* call(bruno, "2026-09-12T09:00:00.000Z", "non interessato")
        yield* call(bruno, "2026-09-13T09:00:00.000Z", "non interessato")
        const api = yield* clientAs(admin.userId)
        const query = {
          from: "2026-10-01",
          to: "2026-10-30",
          compare: "previous",
        } as const

        const answer = yield* api.analytics.getCallsByOperator({ query })
        const exported = yield* callStats(
          periodBounds({ from: "2026-10-01", to: "2026-10-30" })
        ).pipe(provideServer)

        assert.deepStrictEqual(answer.window, {
          from: "2026-10-01",
          to: "2026-10-30",
        })
        assert.deepStrictEqual(answer.comparison, {
          from: "2026-09-01",
          to: "2026-09-30",
        })
        assert.deepStrictEqual(answer.rows, exported.rows)
        // More calls first
        assert.deepStrictEqual(
          answer.rows.map((row) => row.calls),
          [3, 1, 1]
        )
        assert.strictEqual(answer.rows[0]?.operatorId, bruno.id)
        // 4 calls: one with an appointment, one unanswered, two answered
        // without an appointment (so answered and appointments differ)
        assert.deepStrictEqual(answer.comparisonTotals, {
          calls: 4,
          answered: 3,
          appointments: 1,
        })

        const none = yield* api.analytics.getCallsByOperator({
          query: { ...query, compare: "none" },
        })
        assert.strictEqual(none.comparison, null)
        assert.strictEqual(none.comparisonTotals, null)
        assert.deepStrictEqual(none.rows, exported.rows)
      })
  )

  it.effect("il giorno di una chiamata è il giorno di Roma (A1)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const anna = yield* given(() => createOperator())
      // 23:30 UTC of the 14th is 01:30 of the 15th in Rome
      yield* given(() =>
        createTaskEvent({
          actorOperatorId: anna.id,
          createdAt: new Date("2026-10-14T23:30:00.000Z"),
        })
      )
      yield* given(() =>
        createTaskEvent({
          actorOperatorId: anna.id,
          createdAt: new Date("2026-10-14T21:30:00.000Z"),
        })
      )
      const api = yield* clientAs(anna.userId)

      const mine = yield* api.analytics.getMyCallSeries({
        query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
      })

      assert.deepStrictEqual(
        mine.days.map((day) => [day.day, day.calls]),
        [
          ["2026-10-14", 1],
          ["2026-10-15", 1],
        ]
      )
      assert.deepStrictEqual(mine.comparisonDays, [])
    })
  )

  it.effect(
    "un cambio dalla fonte `bulk`, o verso uno stato che non chiude una chiamata, non è una chiamata",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator())
        const at = new Date("2026-10-05T09:00:00.000Z")
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            source: "bulk",
            createdAt: at,
          })
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "followup",
            toState: "chiamare",
            createdAt: at,
          })
        )
        // The only one that is a call
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            source: "detail",
            createdAt: at,
          })
        )
        const api = yield* clientAs(admin.userId)
        const annaApi = yield* clientAs(anna.userId)
        const query = {
          from: "2026-10-01",
          to: "2026-10-30",
          compare: "none",
        } as const

        const all = yield* api.analytics.getCallsByOperator({ query })
        const mine = yield* annaApi.analytics.getMyCallSeries({ query })

        assert.deepStrictEqual(
          all.rows.map((row) => [row.operatorId, row.calls]),
          [[anna.id, 1]]
        )
        assert.deepStrictEqual(
          mine.days.map((day) => [day.day, day.calls]),
          [["2026-10-05", 1]]
        )
      })
  )

  it.effect(
    "le chiamate dell'admin in my-call-series sono le sue: è un operatore anche lui",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator())
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: admin.id,
            createdAt: new Date("2026-10-05T09:00:00.000Z"),
          })
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            createdAt: new Date("2026-10-06T09:00:00.000Z"),
          })
        )
        const api = yield* clientAs(admin.userId)

        const mine = yield* api.analytics.getMyCallSeries({
          query: { from: "2026-10-01", to: "2026-10-30", compare: "none" },
        })

        assert.deepStrictEqual(mine.days, [
          {
            day: "2026-10-05",
            calls: 1,
            answered: 1,
            noAnswer: 0,
            appointments: 1,
          },
        ])
      })
  )
})

describe("GET /api/v1/analytics/my-call-series dopo la mezzanotte di Roma", () => {
  it.effect(
    "una chiamata delle 00:30 del 1° ottobre a Roma è nella finestra, non nel confronto (AC9, AC18)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2026-10-30T23:30:00.000Z").getTime())
        const anna = yield* given(() => createOperator())
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            createdAt: new Date("2026-09-30T22:30:00.000Z"),
          })
        )
        const api = yield* clientAs(anna.userId)

        const mine = yield* api.analytics.getMyCallSeries({
          query: { from: "2026-10-01", to: "2026-11-01", compare: "previous" },
        })

        assert.deepStrictEqual(mine.window, {
          from: "2026-10-01",
          to: "2026-10-31",
        })
        assert.deepStrictEqual(
          mine.days.map((day) => [day.day, day.calls]),
          [["2026-10-01", 1]]
        )
        assert.deepStrictEqual(mine.comparisonDays, [])
      })
  )
})
