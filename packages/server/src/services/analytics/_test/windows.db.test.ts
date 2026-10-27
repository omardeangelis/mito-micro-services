// @vitest-environment node
import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type ServerContext } from "@mito/server/effect/server"
import { provideServer } from "@/test/effect"
import { type Actor } from "@mito/domain/contact/permissions"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { actorOf } from "../../contact/actor"
import { financedAverage, financedByBranch, financedTotal } from "../financed"
import { DAY, T } from "./clock"

/** The program with the `Clock` stopped at `millis`: the `TestClock` of `it.effect`. */
const at = <A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerContext>
) => TestClock.setTime(millis).pipe(Effect.andThen(program), provideServer)

// Le finestre degli importi dall'orologio del server, lette a ogni chiamata
// (AC9), con N = 30, 90 o 365 giorni:
// - riferimento: da adesso − N × 24 ore ad adesso, estremi inclusi;
// - confronto: da adesso − 2N × 24 ore, incluso, ad adesso − N × 24 ore,
//   escluso.
// Ogni test ferma il Clock a `T`, un istante lontano dall'ora vera.

let admin: Actor
let customerId: string

/** Una pratica del cliente di prova, liquidata all'istante `millis`. */
const practiceAt = (millis: number, amount: number) =>
  createPractice({
    customerId,
    importoFinanziato: String(amount),
    dataLiquidazione: new Date(millis),
    desPuntoVendita: "Roma",
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  const owner = await createOperator({ role: "OPERATORE" })
  customerId = (await createCustomer({ operatorId: owner.id })).id
  admin = actorOf(await createOperator({ role: "ADMIN" }))
})

describe("finestre dal Clock, a ogni chiamata", () => {
  it.effect(
    "con il `Clock` a `T` e poi a `T + 1` giorno, `financedTotal` di `30d` conta la stessa pratica prima nel riferimento e poi nel confronto",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => practiceAt(T - 29.5 * DAY, 1000))

        const first = yield* at(
          T,
          financedTotal({ timeFrame: "30d", actor: admin })
        )
        const second = yield* at(
          T + DAY,
          financedTotal({ timeFrame: "30d", actor: admin })
        )

        expect(first).toMatchObject({ reference: 1000, comparison: 0 })
        expect(second).toMatchObject({ reference: 0, comparison: 1000 })
      })
  )

  it.effect(
    "con il `Clock` a `T` e poi a `T + 1` giorno, `financedAverage` di `30d` sposta la pratica dal riferimento al confronto",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => practiceAt(T - 29.5 * DAY, 1000))

        const first = yield* at(
          T,
          financedAverage({ timeFrame: "30d", actor: admin })
        )
        const second = yield* at(
          T + DAY,
          financedAverage({ timeFrame: "30d", actor: admin })
        )

        expect(first).toMatchObject({ reference: 1000, comparison: 0 })
        expect(second).toMatchObject({ reference: 0, comparison: 1000 })
      })
  )
})

describe.each([
  { timeFrame: "30d", n: 30 },
  { timeFrame: "90d", n: 90 },
  { timeFrame: "365d", n: 365 },
] as const)("con `$timeFrame`", ({ timeFrame, n }) => {
  it.effect(
    "gli estremi: adesso e adesso − N × 24 ore nel solo riferimento, adesso − 2N × 24 ore nel confronto, un millisecondo fuori in nessuna",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => practiceAt(T, 1000))
        yield* Effect.promise(() => practiceAt(T - n * DAY, 2000))
        yield* Effect.promise(() => practiceAt(T - 2 * n * DAY, 4000))
        yield* Effect.promise(() => practiceAt(T - 2 * n * DAY - 1, 8000))
        yield* Effect.promise(() => practiceAt(T + 1, 16000))

        expect(
          yield* at(T, financedTotal({ timeFrame, actor: admin }))
        ).toMatchObject({ reference: 3000, comparison: 4000 })
      })
  )

  it.effect(
    "`windows` sono le due finestre su cui il servizio ha contato",
    () =>
      Effect.gen(function* () {
        const windows = {
          reference: { start: new Date(T - n * DAY), end: new Date(T) },
          comparison: {
            start: new Date(T - 2 * n * DAY),
            end: new Date(T - n * DAY),
          },
        }

        expect(
          (yield* at(T, financedTotal({ timeFrame, actor: admin }))).windows
        ).toEqual(windows)
        expect(
          (yield* at(T, financedAverage({ timeFrame, actor: admin }))).windows
        ).toEqual(windows)
      })
  )
})

describe("ciambella per sede", () => {
  it.effect("conta con la finestra di riferimento, estremi inclusi", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => practiceAt(T, 1000))
      yield* Effect.promise(() => practiceAt(T - 15 * DAY, 2000))
      yield* Effect.promise(() => practiceAt(T - 30 * DAY, 4000))
      yield* Effect.promise(() => practiceAt(T - 45 * DAY, 8000))
      yield* Effect.promise(() => practiceAt(T + 1, 16000))

      expect(yield* at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
        { data: "Roma", total: 7000 },
      ])
    })
  )
})
