import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type TaskStatus } from "@mito/domain/schemas"
import { callsRegistryAt } from "../../export/callStats"
import { teamActivity } from "../../import/wave/team"
import { getTeamDay } from "../teamDay"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createOperator, createTaskEvent, createUser } from "@/test/factories"

// The numbers of today of the team (spec home-admin, AC6, AC7, D5): the calls
// of the people of the team, from the midnight of Rome

// Rome: 2026-10-20, 12:00 (CEST), so midnight is 2026-10-19T22:00Z
const NOW = new Date("2026-10-20T10:00:00.000Z")
const MORNING = new Date("2026-10-20T07:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A call of `operatorId` that ended in `outcome` */
const callAt = (
  operatorId: number,
  at: Date = MORNING,
  outcome: TaskStatus = "richiamare"
) =>
  given(() =>
    createTaskEvent({
      actorOperatorId: operatorId,
      action: "call",
      source: "list",
      fromState: null,
      toState: outcome,
      outcome,
      origin: "list",
      createdAt: at,
    })
  )

const read = Effect.gen(function* () {
  yield* TestClock.setTime(NOW.getTime())
  return yield* getTeamDay().pipe(provideServer)
})

describe("le persone del team (AC6)", () => {
  it.effect("senza nessuno è tutto a 0", () =>
    Effect.gen(function* () {
      expect(yield* read).toEqual({
        calls: 0,
        answered: 0,
        appointments: 0,
        called: 0,
        members: 0,
      })
    })
  )

  it.effect("le chiamate di un ADMIN contano", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      yield* callAt(admin.id)

      const day = yield* read

      expect(day.calls).toBe(1)
      expect(day.called).toBe(1)
    })
  )

  it.effect("quelle di un disattivato no, e non è tra i membri", () =>
    Effect.gen(function* () {
      const gone = yield* given(() => createOperator({ disabledAt: NOW }))
      yield* callAt(gone.id)

      expect(yield* read).toEqual({
        calls: 0,
        answered: 0,
        appointments: 0,
        called: 0,
        members: 0,
      })
    })
  )

  it.effect("members conta gli ADMIN senza chiamate", () =>
    Effect.gen(function* () {
      yield* given(() => createOperator({ role: "ADMIN" }))
      yield* given(() => createOperator())

      const day = yield* read

      expect(day.members).toBe(2)
      expect(day.called).toBe(0)
    })
  )

  it.effect("un utente senza riga operatore non è nel team", () =>
    Effect.gen(function* () {
      yield* given(() => createOperator())
      yield* given(() => createUser({ role: "ADMIN" }))
      yield* given(() => createUser())

      expect((yield* read).members).toBe(1)
    })
  )
})

describe("le chiamate di oggi (AC6, AC7)", () => {
  it.effect("una di ieri non conta, a cavallo della mezzanotte di Roma", () =>
    Effect.gen(function* () {
      const op = yield* given(() => createOperator())
      // Rome: 23:59:59.999 of the 19th, and 00:00 of the 20th
      yield* callAt(op.id, new Date("2026-10-19T21:59:59.999Z"))
      yield* callAt(op.id, new Date("2026-10-19T22:00:00.000Z"))

      expect((yield* read).calls).toBe(1)
    })
  )

  it.effect("called conta le persone distinte", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      yield* given(() => createOperator())
      yield* callAt(ada.id)
      yield* callAt(ada.id)
      yield* callAt(bea.id)

      const day = yield* read

      expect(day.calls).toBe(3)
      expect(day.called).toBe(2)
      expect(day.members).toBe(3)
    })
  )

  it.effect("answered esclude Non risponde, appointments è app.to", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      yield* callAt(ada.id, MORNING, "non risponde")
      yield* callAt(ada.id, MORNING, "app.to")
      yield* callAt(bea.id, MORNING, "app.to")
      yield* callAt(bea.id, MORNING, "richiamare")
      yield* callAt(bea.id, MORNING, "non interessato")

      expect(yield* read).toEqual({
        calls: 5,
        answered: 4,
        appointments: 2,
        called: 2,
        members: 2,
      })
    })
  )
})

describe("l'attività del team (D4)", () => {
  it.effect(
    "lastCallAt è l'istante dell'ultima chiamata, senza chiamate nulla",
    () =>
      Effect.gen(function* () {
        const ada = yield* given(() => createOperator())
        const bea = yield* given(() => createOperator())
        yield* callAt(ada.id, new Date("2026-10-18T09:00:00.000Z"))
        yield* callAt(ada.id, MORNING)

        const activity = yield* Effect.gen(function* () {
          const registryAt = yield* callsRegistryAt()
          return yield* teamActivity(
            [ada.id, bea.id],
            NOW,
            "2026-10-20",
            registryAt
          )
        }).pipe(provideServer)

        expect(activity.get(ada.id)?.lastCallAt).toEqual(MORNING)
        expect(activity.get(ada.id)?.lastDay).toBe("2026-10-20")
        expect(activity.has(bea.id)).toBe(false)
      })
  )
})
