import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { NotAdmin } from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createTaskEvent } from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// «Oggi» on the analysis page (brain/specs/crm/andamenti-chiamate): the
// working hours of today, decided by the server's Clock

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

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** An instant of 10/11/2026 in Rome, winter time (UTC+1) */
const rome = (time: string, day = "2026-11-10") =>
  new Date(`${day}T${time}+01:00`)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/analytics/calls-by-operator con range=today", () => {
  it.effect(
    "alle 15:20 conta le chiamate dalle 08:00 e non quella delle 07:50, sulle ore 08:00–15:20 (AC21, AC27)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        for (const time of ["07:50", "08:00", "15:10"]) {
          yield* given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: rome(time),
            })
          )
        }
        const api = yield* clientAs(admin.userId)

        const answer = yield* api.analytics.getCallsByOperator({
          query: {
            range: "today",
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "previous",
          },
        })

        assert.deepStrictEqual(
          answer.rows.map((row) => [row.operatorId, row.calls]),
          [[anna.id, 2]]
        )
        assert.isNotNull(answer.hours)
        const hours = answer.hours ?? []
        assert.strictEqual(hours.length, 8)
        assert.deepStrictEqual(hours[0]?.start, rome("08:00"))
        assert.deepStrictEqual(hours.at(-1), {
          start: rome("15:00"),
          end: rome("15:20"),
          inProgress: true,
        })
      })
  )

  it.effect(
    "col periodo precedente confronta l'ora in corso fino agli stessi minuti di ieri (AC20)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        for (const time of ["15:10", "15:30"]) {
          yield* given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: rome(time, "2026-11-09"),
            })
          )
        }
        const api = yield* clientAs(admin.userId)

        const answer = yield* api.analytics.getCallsByOperator({
          query: {
            range: "today",
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "previous",
          },
        })

        assert.deepStrictEqual(answer.rows, [])
        assert.strictEqual(answer.comparisonTotals?.calls, 1)
        assert.deepStrictEqual(
          answer.comparisonRows?.map((row) => [row.operatorId, row.calls]),
          [[anna.id, 1]]
        )
        assert.deepStrictEqual(answer.comparison, {
          from: "2026-11-09",
          to: "2026-11-09",
        })
        assert.deepStrictEqual(
          answer.comparisonHours?.at(-1)?.end,
          rome("15:20", "2026-11-09")
        )
      })
  )

  it.effect(
    "prima delle 08 non ha ore, e confronta con le ore 11–19 di ieri (AC24, AC27)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("07:15").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        for (const time of ["10:30", "12:00", "18:59", "19:00"]) {
          yield* given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: rome(time, "2026-11-09"),
            })
          )
        }
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            createdAt: rome("07:00"),
          })
        )
        const api = yield* clientAs(admin.userId)

        const answer = yield* api.analytics.getCallsByOperator({
          query: {
            range: "today",
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "previous",
          },
        })

        assert.deepStrictEqual(answer.hours, [])
        assert.deepStrictEqual(answer.rows, [])
        assert.deepStrictEqual(
          answer.comparisonRows?.map((row) => [row.operatorId, row.calls]),
          [[anna.id, 2]]
        )
        assert.deepStrictEqual(answer.comparisonTotals, {
          calls: 2,
          answered: 2,
          appointments: 2,
        })
        const compared = answer.comparisonHours ?? []
        assert.strictEqual(compared.length, 8)
        assert.deepStrictEqual(compared[0]?.start, rome("11:00", "2026-11-09"))
        assert.deepStrictEqual(
          compared.at(-1)?.end,
          rome("19:00", "2026-11-09")
        )
      })
  )

  it.effect(
    "senza range conta i giorni interi, come prima, senza ore (AC27)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("15:20").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        for (const time of ["07:50", "19:30"]) {
          yield* given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: rome(time, "2026-11-09"),
            })
          )
        }
        const api = yield* clientAs(admin.userId)

        const answer = yield* api.analytics.getCallsByOperator({
          query: { from: "2026-11-09", to: "2026-11-10", compare: "previous" },
        })

        assert.deepStrictEqual(answer.window, {
          from: "2026-11-09",
          to: "2026-11-10",
        })
        assert.deepStrictEqual(answer.comparison, {
          from: "2026-11-07",
          to: "2026-11-08",
        })
        assert.deepStrictEqual(
          answer.rows.map((row) => [row.operatorId, row.calls]),
          [[anna.id, 2]]
        )
        assert.deepStrictEqual(answer.comparisonTotals, {
          calls: 0,
          answered: 0,
          appointments: 0,
        })
        assert.isNull(answer.hours)
        assert.isNull(answer.comparisonHours)
        assert.isNull(answer.comparisonRows)
      })
  )

  it.effect("con range=today la finestra è oggi, qualunque from e to", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(rome("15:20").getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const api = yield* clientAs(admin.userId)

      const answer = yield* api.analytics.getCallsByOperator({
        query: {
          range: "today",
          from: "2026-10-01",
          to: "2026-10-05",
          compare: "none",
        },
      })

      assert.deepStrictEqual(answer.window, {
        from: "2026-11-10",
        to: "2026-11-10",
      })
      assert.isNull(answer.comparison)
      assert.isNull(answer.comparisonHours)
      assert.isNull(answer.comparisonRows)
      assert.isNull(answer.comparisonTotals)
    })
  )

  it.effect(
    "il 29 febbraio, con l'anno prima, non ha confronto, nemmeno per il finanziato (AC20, AC22)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("15:20", "2028-02-29").getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const api = yield* clientAs(admin.userId)
        const query = {
          range: "today",
          from: "2028-02-29",
          to: "2028-02-29",
          compare: "last-year",
        } as const

        const calls = yield* api.analytics.getCallsByOperator({ query })
        const financed = yield* api.analytics.getFinancedSeries({ query })

        assert.isNull(calls.comparison)
        assert.isNull(calls.comparisonHours)
        assert.isNull(calls.comparisonRows)
        assert.isNull(calls.comparisonTotals)
        assert.strictEqual(calls.hours?.length, 8)
        assert.deepStrictEqual(financed.window, {
          from: "2028-02-29",
          to: "2028-02-29",
        })
        assert.isNull(financed.comparison)
        assert.deepStrictEqual(financed.comparisonDays, [])
      })
  )

  it.effect("è dell'admin: un operatore è NotAdmin anche con «Oggi»", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(rome("15:20").getTime())
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.analytics.getCallsByOperator({
          query: {
            range: "today",
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "previous",
          },
        })
      )

      assert.instanceOf(error, NotAdmin)
    })
  )
})

describe("GET /api/v1/analytics/my-call-series con range=today", () => {
  it.effect(
    "alle 10:30 dà tre ore, l'ultima in corso, con le chiamate dell'operatore in ognuna (AC21, AC26)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("10:30").getTime())
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const bruno = yield* given(() => createOperator({ surname: "Bruno" }))
        for (const time of ["08:10", "09:59", "10:00", "10:20"]) {
          yield* given(() =>
            createTaskEvent({ actorOperatorId: anna.id, createdAt: rome(time) })
          )
        }
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: bruno.id,
            createdAt: rome("09:00"),
          })
        )
        const api = yield* clientAs(anna.userId)

        const answer = yield* api.analytics.getMyCallSeries({
          query: {
            range: "today",
            from: "2026-11-10",
            to: "2026-11-10",
            compare: "none",
          },
        })

        assert.deepStrictEqual(
          (answer.hours ?? []).map((hour) => [
            hour.start,
            hour.end,
            hour.inProgress,
            hour.calls,
          ]),
          [
            [rome("08:00"), rome("09:00"), false, 1],
            [rome("09:00"), rome("10:00"), false, 1],
            [rome("10:00"), rome("10:30"), true, 2],
          ]
        )
        assert.deepStrictEqual(answer.days, [])
      })
  )

  const today = {
    range: "today" as const,
    from: "2026-11-10",
    to: "2026-11-10",
  }
  const callsOf = (hours: ReadonlyArray<{ calls: number }> | null) =>
    (hours ?? []).map((hour) => hour.calls)

  it.effect("alle 15:20 dà otto ore, l'ultima 15–15:20 in corso (AC21)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(rome("15:20").getTime())
      const anna = yield* given(() => createOperator({ surname: "Anna" }))
      const api = yield* clientAs(anna.userId)

      const answer = yield* api.analytics.getMyCallSeries({
        query: { ...today, compare: "none" },
      })

      const hours = answer.hours ?? []
      assert.strictEqual(hours.length, 8)
      assert.deepStrictEqual(
        hours.map((hour) => hour.inProgress),
        [false, false, false, false, false, false, false, true]
      )
      const last = hours[7]
      assert.deepStrictEqual(
        [last?.start, last?.end],
        [rome("15:00"), rome("15:20")]
      )
      assert.isNull(answer.comparisonHours)
    })
  )

  it.effect("15:59:59 è nell'ora 15–16 e 16:00:00 nella 16–17 (AC26)", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(rome("16:30").getTime())
      const anna = yield* given(() => createOperator({ surname: "Anna" }))
      for (const time of ["15:59:59", "16:00:00"]) {
        yield* given(() =>
          createTaskEvent({ actorOperatorId: anna.id, createdAt: rome(time) })
        )
      }
      const api = yield* clientAs(anna.userId)

      const answer = yield* api.analytics.getMyCallSeries({
        query: { ...today, compare: "none" },
      })

      const byStart = new Map(
        (answer.hours ?? []).map((hour) => [hour.start.getTime(), hour.calls])
      )
      assert.strictEqual(byStart.get(rome("15:00").getTime()), 1)
      assert.strictEqual(byStart.get(rome("16:00").getTime()), 1)
    })
  )

  it.effect(
    "le chiamate prima delle 08:00 o dalle 19:00 non sono in nessuna ora (AC27)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("19:30").getTime())
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        for (const time of ["07:50", "12:10", "19:05"]) {
          yield* given(() =>
            createTaskEvent({ actorOperatorId: anna.id, createdAt: rome(time) })
          )
        }
        const api = yield* clientAs(anna.userId)

        const answer = yield* api.analytics.getMyCallSeries({
          query: { ...today, compare: "none" },
        })

        assert.strictEqual(answer.hours?.length, 8)
        assert.strictEqual(
          callsOf(answer.hours).reduce((sum, calls) => sum + calls, 0),
          1
        )
      })
  )

  it.effect(
    "alle 07:15 con «Periodo precedente»: nessuna ora di oggi e le ore 11–19 di ieri (AC24)",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(rome("07:15").getTime())
        const anna = yield* given(() => createOperator({ surname: "Anna" }))
        const bruno = yield* given(() => createOperator({ surname: "Bruno" }))
        const yesterday = (time: string) =>
          new Date(rome(time).getTime() - 864e5)
        for (const time of ["11:05", "11:40", "18:59"]) {
          yield* given(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: yesterday(time),
            })
          )
        }
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: bruno.id,
            createdAt: yesterday("12:00"),
          })
        )
        const api = yield* clientAs(anna.userId)

        const answer = yield* api.analytics.getMyCallSeries({
          query: { ...today, compare: "previous" },
        })

        assert.deepStrictEqual(answer.hours, [])
        assert.deepStrictEqual(
          callsOf(answer.comparisonHours),
          [2, 0, 0, 0, 0, 0, 0, 1]
        )
        assert.deepStrictEqual(
          (answer.comparisonHours ?? []).map((hour) => hour.inProgress),
          Array.from({ length: 8 }, () => false)
        )
        assert.deepStrictEqual(answer.days, [])
        assert.deepStrictEqual(answer.comparisonDays, [])
      })
  )

  it.effect("senza range risponde per giorno, con ore e confronto nulli", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(rome("15:20").getTime())
      const anna = yield* given(() => createOperator({ surname: "Anna" }))
      yield* given(() =>
        createTaskEvent({ actorOperatorId: anna.id, createdAt: rome("10:00") })
      )
      const api = yield* clientAs(anna.userId)

      const answer = yield* api.analytics.getMyCallSeries({
        query: { from: "2026-11-10", to: "2026-11-10", compare: "none" },
      })

      assert.isNull(answer.hours)
      assert.isNull(answer.comparisonHours)
      assert.deepStrictEqual(
        answer.days.map((day) => [day.day, day.calls]),
        [["2026-11-10", 1]]
      )
    })
  )
})
