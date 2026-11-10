import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { NotAdmin, Unauthorized } from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createTaskEvent } from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// «Andamento delle chiamate» of the admin's home (spec andamenti-chiamate,
// AC2, AC5, AC9, AC27): the team's calls by day or by hour

/** The session the backend read for the request: `userId`'s */
const sessionOf = (userId: string) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed({
        user: { id: userId },
        expires: "2099-01-01T00:00:00.000Z",
      }),
  })

/** The client of the groups `home` and `analytics`, on the real handlers */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["home", "analytics"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

/** The same client with no session at all */
const anonymousClient = () =>
  HttpApiTest.groups(MitoApi, ["home", "analytics"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(
      Layer.succeed(SessionReader)({ read: () => Effect.succeed(null) })
    ),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** An instant in Rome, winter time (UTC+1) */
const rome = (day: string, time: string) => new Date(`${day}T${time}+01:00`)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/home/call-trend", () => {
  it.effect(
    "a 7 giorni dà un giorno per riga, con le somme uguali ai totali di Analisi (AC9)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("2026-11-10", "15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const bruno = yield* given(() => createOperator({ surname: "Bruno" }))
        const call = (
          operator: { id: number },
          day: string,
          toState?: "non risponde"
        ) =>
          given(() =>
            createTaskEvent({
              actorOperatorId: operator.id,
              createdAt: rome(day, "10:00"),
              ...(toState ? { toState } : {}),
            })
          )
        yield* call(anna, "2026-11-05")
        yield* call(bruno, "2026-11-05", "non risponde")
        yield* call(bruno, "2026-11-09")
        const api = yield* clientAs(admin.userId)

        const trend = yield* api.home.getCallTrend({ query: { period: "7d" } })
        const analysis = yield* api.analytics.getCallsByOperator({
          query: { from: "2026-11-04", to: "2026-11-10", compare: "none" },
        })

        assert.deepStrictEqual(
          trend.days.map((day) => day.day),
          ["2026-11-05", "2026-11-09"]
        )
        const sum = (key: "calls" | "answered" | "appointments") =>
          trend.days.reduce((total, day) => total + day[key], 0)
        const totals = (key: "calls" | "answered" | "appointments") =>
          analysis.rows.reduce((total, row) => total + row[key], 0)
        assert.strictEqual(sum("calls"), totals("calls"))
        assert.strictEqual(sum("answered"), totals("answered"))
        assert.strictEqual(sum("appointments"), totals("appointments"))
        assert.strictEqual(sum("calls"), 3)
      })
  )

  it.effect.each(["30d", "90d"] as const)(
    "con %s le somme sono quelle di Analisi, di chiunque e dei disattivati compresi (AC9)",
    (period) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("2026-11-10", "15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const gone = yield* given(() =>
          createOperator({
            surname: "Gone",
            disabledAt: rome("2026-11-08", "09:00"),
          })
        )
        const call = (
          operator: { id: number },
          day: string,
          toState?: "non risponde"
        ) =>
          given(() =>
            createTaskEvent({
              actorOperatorId: operator.id,
              createdAt: rome(day, "10:00"),
              ...(toState ? { toState } : {}),
            })
          )
        yield* call(admin, "2026-10-20")
        yield* call(anna, "2026-10-20", "non risponde")
        yield* call(gone, "2026-11-01")
        yield* call(gone, "2026-11-10")
        const api = yield* clientAs(admin.userId)

        const trend = yield* api.home.getCallTrend({ query: { period } })
        const analysis = yield* api.analytics.getCallsByOperator({
          query: { ...trend.window, compare: "none" },
        })

        assert.strictEqual(trend.hours, null)
        assert.strictEqual(trend.window.to, "2026-11-10")
        const sum = (key: "calls" | "answered" | "appointments") =>
          trend.days.reduce((total, day) => total + day[key], 0)
        const totals = (key: "calls" | "answered" | "appointments") =>
          analysis.rows.reduce((total, row) => total + row[key], 0)
        assert.strictEqual(sum("calls"), 4)
        assert.strictEqual(sum("calls"), totals("calls"))
        assert.strictEqual(sum("answered"), totals("answered"))
        assert.strictEqual(sum("appointments"), totals("appointments"))
      })
  )

  it.effect(
    "con today dà le ore di Oggi, con le somme di Analisi, e una chiamata delle 07:50 non è in nessuna ora ma conta in 7d (AC5, AC26, AC27)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("2026-11-10", "15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const callAt = (time: string, toState?: "non risponde") =>
          given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: rome("2026-11-10", time),
              ...(toState ? { toState } : {}),
            })
          )
        yield* callAt("07:50")
        yield* callAt("09:30")
        yield* callAt("15:10", "non risponde")
        const api = yield* clientAs(admin.userId)

        const trend = yield* api.home.getCallTrend({
          query: { period: "today" },
        })
        const analysis = yield* api.analytics.getCallsByOperator({
          query: {
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "none",
            range: "today",
          },
        })
        const week = yield* api.home.getCallTrend({ query: { period: "7d" } })

        const hours = trend.hours ?? []
        assert.deepStrictEqual(trend.days, [])
        assert.strictEqual(hours.length, 8)
        assert.strictEqual(hours.at(-1)?.inProgress, true)
        assert.strictEqual(
          hours.reduce((total, hour) => total + hour.calls, 0),
          2
        )
        assert.strictEqual(
          hours.reduce((total, hour) => total + hour.calls, 0),
          analysis.rows.reduce((total, row) => total + row.calls, 0)
        )
        assert.strictEqual(
          hours.reduce((total, hour) => total + hour.noAnswer, 0),
          1
        )
        assert.deepStrictEqual(
          week.days.map((day) => [day.day, day.calls]),
          [["2026-11-10", 3]]
        )
      })
  )

  it.effect("un OPERATORE riceve NotAdmin", () =>
    Effect.gen(function* () {
      const anna = yield* given(() => createOperator({ surname: "Anna" }))
      const api = yield* clientAs(anna.userId)

      const error = yield* api.home
        .getCallTrend({ query: { period: "7d" } })
        .pipe(Effect.flip)

      assert.instanceOf(error, NotAdmin)
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* anonymousClient()

      const error = yield* api.home
        .getCallTrend({ query: { period: "today" } })
        .pipe(Effect.flip)

      assert.instanceOf(error, Unauthorized)
    })
  )
})
