import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { DbLive } from "../../../effect/db"
import { callStats } from "../callStats"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTaskEvent } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/** 1 October 2026 in Rome (summer time, UTC+2). */
const PERIOD = {
  start: new Date("2026-09-30T22:00:00.000Z"),
  end: new Date("2026-10-02T22:00:00.000Z"),
}
const INSIDE = new Date("2026-10-01T10:00:00.000Z")

const run = (period = PERIOD) => callStats(period).pipe(Effect.provide(DbLive))

describe("callStats", () => {
  it.effect(
    "counts calls, answered, appointments and no answers per operator (AC9)",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "chiamare",
            toState: "app.to",
            createdAt: INSIDE,
          })
        )
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "chiamare",
            toState: "non risponde",
            createdAt: INSIDE,
          })
        )

        expect(yield* run()).toEqual({
          rows: [
            {
              operatorId: anna.id,
              name: "Anna",
              surname: "Rossi",
              calls: 2,
              answered: 1,
              appointments: 1,
              noAnswer: 1,
            },
          ],
          totals: { calls: 2, answered: 1, appointments: 1, noAnswer: 1 },
        })
      })
  )

  it.effect(
    "counts a callback from richiamare and a second call to the same contact (AC10)",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        const first = yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "chiamare",
            toState: "non risponde",
            createdAt: INSIDE,
          })
        )
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            customerId: first.customerId,
            fromState: "non risponde",
            toState: "richiamare",
            createdAt: INSIDE,
          })
        )
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            customerId: first.customerId,
            fromState: "richiamare",
            toState: "app.to",
            createdAt: INSIDE,
          })
        )

        expect((yield* run()).totals).toEqual({
          calls: 3,
          answered: 2,
          appointments: 1,
          noAnswer: 1,
        })
      })
  )

  it.effect(
    "leaves out steps between outcomes, reopenings, bulk and system changes, and other actions (AC10)",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        const notCalls = [
          { fromState: "app.to", toState: "caricato" },
          { fromState: "caricato", toState: "erogata" },
          { fromState: "app.to", toState: "chiamare" },
          { fromState: "nessuno", toState: "app.to" },
          { fromState: null, toState: "app.to" },
          { fromState: "chiamare", toState: "app.to", source: "bulk" },
          {
            fromState: "richiamare",
            toState: "followup",
            source: "cron_alert",
          },
          { fromState: "chiamare", toState: "app.to", source: "self_assign" },
          {
            fromState: null,
            toState: null,
            action: "operator_reassign",
            source: "detail",
          },
        ] as const
        for (const values of notCalls) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: INSIDE,
              ...values,
            })
          )
        }

        expect(yield* run()).toEqual({
          rows: [],
          totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
        })
      })
  )

  it.effect(
    "takes the first and the last day whole, in Rome, and nothing outside (AC11)",
    () =>
      Effect.gen(function* () {
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        const at = [
          "2026-09-30T21:59:59.999Z", // 23:59 of the day before, in Rome
          "2026-09-30T22:00:00.000Z", // 00:00 of the first day
          "2026-10-02T21:59:59.999Z", // 23:59 of the last day
          "2026-10-02T22:00:00.000Z", // 00:00 of the day after
        ]
        for (const createdAt of at) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              createdAt: new Date(createdAt),
            })
          )
        }

        expect((yield* run()).totals.calls).toBe(2)
      })
  )

  it.effect(
    "orders the operators by calls, then surname and name, and sums them (AC12)",
    () =>
      Effect.gen(function* () {
        const verdi = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Verdi" })
        )
        const bianchi = yield* Effect.promise(() =>
          createOperator({ name: "Bruno", surname: "Bianchi" })
        )
        yield* Effect.promise(() =>
          createOperator({ name: "Carla", surname: "Neri" })
        ) // no calls
        for (const operator of [verdi, bianchi, bianchi]) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: operator.id,
              createdAt: INSIDE,
            })
          )
        }

        const { rows, totals } = yield* run()
        expect(rows.map((row) => row.surname)).toEqual(["Bianchi", "Verdi"])
        expect(totals.calls).toBe(3)
      })
  )

  it.effect("answers only totals: no customer, phone or note (AC22)", () =>
    Effect.gen(function* () {
      const anna = yield* Effect.promise(() =>
        createOperator({ name: "Anna", surname: "Rossi" })
      )
      yield* Effect.promise(() =>
        createTaskEvent({ actorOperatorId: anna.id, createdAt: INSIDE })
      )

      const { rows } = yield* run()
      expect(Object.keys(rows[0]!).sort()).toEqual([
        "answered",
        "appointments",
        "calls",
        "name",
        "noAnswer",
        "operatorId",
        "surname",
      ])
    })
  )
})
