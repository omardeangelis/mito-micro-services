import { Clock, Effect, Exit } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { type Actor } from "@mito/domain/contact/permissions"
import { type ServerContext } from "@mito/server/effect/server"
import { runServer } from "@/test/effect"
import { migrateUpTo, resetDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { financedAverage, financedByBranch, financedTotal } from "../financed"

// Le finestre degli importi dall'orologio del server, lette a ogni chiamata
// (AC9), con N = 30, 90 o 365 giorni:
// - riferimento: da adesso − N × 24 ore ad adesso, estremi inclusi;
// - confronto: da adesso − 2N × 24 ore, incluso, ad adesso − N × 24 ore,
//   escluso.
// Ogni test ferma il Clock a un istante lontano dall'ora vera.

const DAY = 86_400_000

/** Adesso, per i test: il 15 giugno 2026 a mezzogiorno UTC. */
const T = Date.UTC(2026, 5, 15, 12)

/** Un Clock fermo a `millis`. */
const fixedClock = (millis: number): Clock.Clock => ({
  [Clock.ClockTypeId]: Clock.ClockTypeId,
  unsafeCurrentTimeMillis: () => millis,
  currentTimeMillis: Effect.succeed(millis),
  unsafeCurrentTimeNanos: () => BigInt(millis) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n),
  sleep: () => Effect.void,
})

/** Il valore del programma con il Clock fermo a `millis`. */
async function at<A, E>(
  millis: number,
  program: Effect.Effect<A, E, ServerContext>
): Promise<A> {
  const exit = await runServer(
    program.pipe(Effect.withClock(fixedClock(millis)))
  )
  if (Exit.isFailure(exit))
    throw new Error(`il programma è fallito: ${exit.cause.toString()}`)
  return exit.value
}

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
  admin = {
    operatorId: (await createOperator({ role: "ADMIN" })).id,
    role: "ADMIN",
  }
})

describe("finestre dal Clock, a ogni chiamata", () => {
  it("con il `Clock` a `T` e poi a `T + 1` giorno, `financedTotal` di `30d` conta la stessa pratica prima nel riferimento e poi nel confronto", async () => {
    await practiceAt(T - 29.5 * DAY, 1000)

    const first = await at(T, financedTotal({ timeFrame: "30d", actor: admin }))
    const second = await at(
      T + DAY,
      financedTotal({ timeFrame: "30d", actor: admin })
    )

    expect(first).toMatchObject({ reference: 1000, comparison: 0 })
    expect(second).toMatchObject({ reference: 0, comparison: 1000 })
  })

  it("con il `Clock` a `T` e poi a `T + 1` giorno, `financedAverage` di `30d` sposta la pratica dal riferimento al confronto", async () => {
    await practiceAt(T - 29.5 * DAY, 1000)

    const first = await at(
      T,
      financedAverage({ timeFrame: "30d", actor: admin })
    )
    const second = await at(
      T + DAY,
      financedAverage({ timeFrame: "30d", actor: admin })
    )

    expect(first).toMatchObject({ reference: 1000, comparison: 0 })
    expect(second).toMatchObject({ reference: 0, comparison: 1000 })
  })
})

describe.each([
  { timeFrame: "30d", n: 30 },
  { timeFrame: "90d", n: 90 },
  { timeFrame: "365d", n: 365 },
] as const)("con `$timeFrame`", ({ timeFrame, n }) => {
  it("gli estremi: adesso e adesso − N × 24 ore nel solo riferimento, adesso − 2N × 24 ore nel confronto, un millisecondo fuori in nessuna", async () => {
    await practiceAt(T, 1000)
    await practiceAt(T - n * DAY, 2000)
    await practiceAt(T - 2 * n * DAY, 4000)
    await practiceAt(T - 2 * n * DAY - 1, 8000)
    await practiceAt(T + 1, 16000)

    expect(
      await at(T, financedTotal({ timeFrame, actor: admin }))
    ).toMatchObject({ reference: 3000, comparison: 4000 })
  })

  it("`windows` sono le due finestre su cui il servizio ha contato", async () => {
    const windows = {
      reference: { start: new Date(T - n * DAY), end: new Date(T) },
      comparison: {
        start: new Date(T - 2 * n * DAY),
        end: new Date(T - n * DAY),
      },
    }

    expect(
      (await at(T, financedTotal({ timeFrame, actor: admin }))).windows
    ).toEqual(windows)
    expect(
      (await at(T, financedAverage({ timeFrame, actor: admin }))).windows
    ).toEqual(windows)
  })
})

describe("ciambella per sede", () => {
  it("conta con la finestra di riferimento, estremi inclusi", async () => {
    await practiceAt(T, 1000)
    await practiceAt(T - 15 * DAY, 2000)
    await practiceAt(T - 30 * DAY, 4000)
    await practiceAt(T - 45 * DAY, 8000)
    await practiceAt(T + 1, 16000)

    expect(await at(T, financedByBranch({ timeFrame: "30d" }))).toEqual([
      { data: "Roma", total: 7000 },
    ])
  })
})
