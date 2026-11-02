import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { Db } from "../../../effect/db"
import { callsByOperator, myCallSeries } from "../../analytics/calls"
import { actorOf } from "../../contact/actor"
import { callStats, CallsRegistryMissing } from "../callStats"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator, createTaskEvent } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

// Le chiamate prima e dopo `calls_registry` (AC26-AC28, D14): prima vale la
// regola di oggi sul cambio di stato, dopo solo le righe `call`.

/** 1 October 2026 in Rome (summer time, UTC+2). */
const PERIOD = {
  start: new Date("2026-09-30T22:00:00.000Z"),
  end: new Date("2026-10-02T22:00:00.000Z"),
}
const BEFORE = new Date("2026-10-01T08:00:00.000Z")
const REGISTRY = new Date("2026-10-01T12:00:00.000Z")
const AFTER = new Date("2026-10-01T16:00:00.000Z")

const setRegistry = (at: Date | null) =>
  Effect.promise(async () => {
    await testDb.execute(
      sql`DELETE FROM "mito-deutsche_app_milestone" WHERE name = 'calls_registry'`
    )
    if (at !== null) {
      await testDb.execute(
        sql`INSERT INTO "mito-deutsche_app_milestone" (name, at) VALUES ('calls_registry', ${at.toISOString()})`
      )
    }
  })

const run = <A, E>(program: Effect.Effect<A, E, Db>) =>
  program.pipe(Effect.provide(Db.layer))

describe("chiamate prima e dopo calls_registry", () => {
  it.effect(
    "dopo calls_registry, due righe call Non risponde e un cambio di stato chiamare -> app.to danno 2 chiamate, 0 risposte e nessun tasso di appuntamento",
    () =>
      Effect.gen(function* () {
        yield* setRegistry(REGISTRY)
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        for (let i = 0; i < 2; i++) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              action: "call",
              source: "detail",
              origin: "list",
              fromState: null,
              toState: null,
              outcome: "non risponde",
              createdAt: AFTER,
            })
          )
        }
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "chiamare",
            toState: "app.to",
            createdAt: AFTER,
          })
        )

        const { totals } = yield* run(callStats(PERIOD))

        expect(totals).toEqual({
          calls: 2,
          answered: 0,
          appointments: 0,
          noAnswer: 2,
        })
      })
  )

  it.effect(
    "un periodo a cavallo conta le righe vecchie e le nuove una volta ciascuna, con le risposte dall'esito",
    () =>
      Effect.gen(function* () {
        yield* setRegistry(REGISTRY)
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi" })
        )
        // Old: a state_change before the instant
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "chiamare",
            toState: "app.to",
            createdAt: BEFORE,
          })
        )
        // New: a call row after it, with an appointment, and one without answer
        for (const outcome of ["app.to", "non risponde"] as const) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              action: "call",
              source: "detail",
              origin: "alert",
              fromState: null,
              toState: null,
              outcome,
              createdAt: AFTER,
            })
          )
        }

        const { rows, totals } = yield* run(callStats(PERIOD))

        expect(totals).toEqual({
          calls: 3,
          answered: 2,
          appointments: 2,
          noAnswer: 1,
        })
        expect(rows).toHaveLength(1)
      })
  )

  it.effect("uno state_change scritto dopo calls_registry non conta", () =>
    Effect.gen(function* () {
      yield* setRegistry(REGISTRY)
      const anna = yield* Effect.promise(() => createOperator())
      yield* Effect.promise(() =>
        createTaskEvent({
          actorOperatorId: anna.id,
          fromState: "chiamare",
          toState: "non risponde",
          createdAt: AFTER,
        })
      )

      const { rows, totals } = yield* run(callStats(PERIOD))

      expect(rows).toEqual([])
      expect(totals.calls).toBe(0)
    })
  )

  it.effect(
    "callStats, callsByOperator e myCallSeries danno gli stessi numeri",
    () =>
      Effect.gen(function* () {
        yield* setRegistry(REGISTRY)
        const anna = yield* Effect.promise(() =>
          createOperator({ name: "Anna", surname: "Rossi", role: "OPERATORE" })
        )
        yield* Effect.promise(() =>
          createTaskEvent({
            actorOperatorId: anna.id,
            fromState: "richiamare",
            toState: "non risponde",
            createdAt: BEFORE,
          })
        )
        for (const outcome of [
          "app.to",
          "richiamare",
          "non risponde",
        ] as const) {
          yield* Effect.promise(() =>
            createTaskEvent({
              actorOperatorId: anna.id,
              action: "call",
              source: "list",
              origin: "list",
              fromState: null,
              toState: null,
              outcome,
              createdAt: AFTER,
            })
          )
        }
        const window = { from: "2026-10-01", to: "2026-10-01" }

        const stats = yield* run(callStats(PERIOD))
        const analysis = yield* run(
          callsByOperator({ window, comparison: null })
        )
        const series = yield* run(
          myCallSeries({ window, comparison: null, actor: actorOf(anna) })
        )

        expect(analysis.rows).toEqual(stats.rows)
        expect(stats.totals.calls).toBe(4)
        expect(series.days).toEqual([
          {
            day: "2026-10-01",
            calls: 4,
            answered: 2,
            noAnswer: 2,
            appointments: 1,
          },
        ])
      })
  )

  it.effect(
    "senza la riga calls_registry fallisce con CallsRegistryMissing",
    () =>
      Effect.gen(function* () {
        yield* setRegistry(null)

        const error = yield* run(callStats(PERIOD)).pipe(Effect.flip)
        const analysisError = yield* run(
          callsByOperator({
            window: { from: "2026-10-01", to: "2026-10-01" },
            comparison: null,
          })
        ).pipe(Effect.flip)

        expect(error).toBeInstanceOf(CallsRegistryMissing)
        expect(analysisError).toBeInstanceOf(CallsRegistryMissing)
      })
  )
})
