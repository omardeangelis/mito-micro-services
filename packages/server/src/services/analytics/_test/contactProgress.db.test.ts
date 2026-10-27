import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type ServerContext } from "@mito/server/effect/server"
import { provideServer } from "@/test/effect"
import { type Actor } from "@mito/domain/contact/permissions"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTask } from "@/test/factories"
import { actorOf } from "../../contact/actor"
import { contactProgress } from "../contactProgress"
import { T } from "./clock"

/** The program with the `Clock` stopped at `millis`: the `TestClock` of `it.effect`. */
const at = <A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerContext>
) => TestClock.setTime(millis).pipe(Effect.andThen(program), provideServer)

// "Contatti con esito" sulla coda attuale (AC17): solo i contatti attivi;
// completati gli stati con un esito, da fare quelli in coda; `nessuno` e lo
// stato vuoto fuori. Un ADMIN conta tutti i contatti attivi, un OPERATORE
// quelli con il suo `task.operator_id`.

const STATES = [
  "chiamare",
  "followup",
  "non risponde",
  "app.to",
  "caricato",
  "erogata",
  "non interessato",
  "richiamare",
  "nessuno",
  null,
] as const

const progressOf = (actor: Actor) => at(T, contactProgress({ actor }))

/** Un contatto attivo e uno non attivo per ogni stato, dell'operatore dato. */
async function seedContacts(operatorId: number | null) {
  for (const state of STATES) {
    for (const isActive of [true, false]) {
      await createTask({ state, isActive, operatorId })
    }
  }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("contactProgress: la coda attuale", () => {
  it.effect(
    "un contatto non attivo con un esito non conta: un contatto non attivo in `app.to` non conta in `done`",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        yield* Effect.promise(() =>
          createTask({
            state: "app.to",
            isActive: false,
            operatorId: operator.id,
          })
        )

        expect(yield* progressOf(actorOf(operator))).toEqual({
          done: 0,
          todo: 0,
        })
      })
  )

  it.effect(
    "dei contatti attivi, `done` conta gli stati con un esito e `todo` quelli in coda; `nessuno` e lo stato vuoto in nessuno dei due",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        for (const state of STATES) {
          yield* Effect.promise(() =>
            createTask({ state, isActive: true, operatorId: operator.id })
          )
        }

        // done: app.to, caricato, erogata, non interessato, richiamare;
        // todo: chiamare, followup, non risponde
        expect(yield* progressOf(actorOf(operator))).toEqual({
          done: 5,
          todo: 3,
        })
      })
  )

  it.effect("`followup` e `non risponde` sono fra i da fare", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ role: "OPERATORE" })
      )
      yield* Effect.promise(() =>
        createTask({
          state: "followup",
          isActive: true,
          operatorId: operator.id,
        })
      )
      yield* Effect.promise(() =>
        createTask({
          state: "non risponde",
          isActive: true,
          operatorId: operator.id,
        })
      )

      expect(yield* progressOf(actorOf(operator))).toEqual({ done: 0, todo: 2 })
    })
  )

  it.effect("i contatti non attivi non contano, in nessuno stato", () =>
    Effect.gen(function* () {
      const operator = yield* Effect.promise(() =>
        createOperator({ role: "OPERATORE" })
      )
      for (const state of STATES) {
        yield* Effect.promise(() =>
          createTask({ state, isActive: false, operatorId: operator.id })
        )
      }

      expect(yield* progressOf(actorOf(operator))).toEqual({ done: 0, todo: 0 })
    })
  )

  it.effect(
    "un ADMIN conta tutti i contatti attivi, di ogni operatore e senza operatore; un OPERATORE solo i suoi",
    () =>
      Effect.gen(function* () {
        const operatorA = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const operatorB = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        yield* Effect.promise(() => seedContacts(operatorA.id))
        yield* Effect.promise(() => seedContacts(operatorB.id))
        yield* Effect.promise(() => seedContacts(null))

        expect(yield* progressOf(actorOf(admin))).toEqual({ done: 15, todo: 9 })
        expect(yield* progressOf(actorOf(operatorA))).toEqual({
          done: 5,
          todo: 3,
        })
        expect(yield* progressOf(actorOf(operatorB))).toEqual({
          done: 5,
          todo: 3,
        })
      })
  )

  it.effect(
    "un contatto attivo creato due anni fa conta ancora: nessun filtro di data",
    () =>
      Effect.gen(function* () {
        const operator = yield* Effect.promise(() =>
          createOperator({ role: "OPERATORE" })
        )
        const twoYearsAgo = new Date()
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
        yield* Effect.promise(() =>
          createTask({
            state: "erogata",
            isActive: true,
            operatorId: operator.id,
            createdAt: twoYearsAgo,
          })
        )

        expect(yield* progressOf(actorOf(operator))).toEqual({
          done: 1,
          todo: 0,
        })
      })
  )
})
