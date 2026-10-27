import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { processDueAlerts } from "../processDueAlerts"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

const NOW = new Date("2026-09-25T06:00:00.000Z")
const EARLIER_DAY = new Date("2026-09-20T08:00:00.000Z")

const run = (budgetMs: number, now = NOW) =>
  Effect.gen(function* () {
    const exit = yield* processDueAlerts(now, { budgetMs }).pipe(
      provideServer,
      Effect.exit
    )
    if (exit._tag === "Failure") throw new Error("processDueAlerts failed")
    return exit.value
  })

async function seedAlert(deadline: Date) {
  const operator = await createOperator()
  const customer = await createCustomer({ operatorId: operator.id })
  const previous = await createTask({
    customerId: customer.id,
    operatorId: operator.id,
    state: "richiamare",
  })
  const alert = await createAlert({ taskId: previous.id, deadline })
  return { operator, customer, alert }
}

const alertsOf = ({
  operator,
  customer,
}: Awaited<ReturnType<typeof seedAlert>>) =>
  createTestCaller(operator).task.getCustomerAlerts({ id: customer.id })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  await createSystemOperator()
})

describe("processDueAlerts a tempo", () => {
  // The budget is measured on the real clock: under TestClock no time passes
  it.live(
    "a tempo esaurito elabora solo il primo alert: gli altri restano aperti e li prende la chiamata dopo",
    () =>
      Effect.gen(function* () {
        const first = yield* Effect.promise(() => seedAlert(EARLIER_DAY))
        const second = yield* Effect.promise(() => seedAlert(EARLIER_DAY))
        expect(yield* run(0)).toEqual({
          found: 2,
          processed: 1,
          skipped: 0,
          failed: 0,
          remaining: 1,
        })
        expect(yield* run(0)).toEqual({
          found: 1,
          processed: 1,
          skipped: 0,
          failed: 0,
          remaining: 0,
        })
        for (const seeded of [first, second]) {
          expect(yield* Effect.promise(() => alertsOf(seeded))).toEqual([
            expect.objectContaining({ id: seeded.alert.id, isResolved: true }),
          ])
        }
      })
  )

  it.live(
    "prende prima gli alert che scadono oggi, gli unici che creano il followup",
    () =>
      Effect.gen(function* () {
        // Created first: in table order it would be taken first
        const earlier = yield* Effect.promise(() => seedAlert(EARLIER_DAY))
        const today = yield* Effect.promise(() =>
          seedAlert(new Date("2026-09-25T08:00:00.000Z"))
        )
        expect(yield* run(0)).toMatchObject({ processed: 1, remaining: 1 })

        const [active] = yield* Effect.promise(() =>
          createTestCaller(today.operator).task.getActiveTask({
            id: today.customer.id,
          })
        )
        expect(active).toMatchObject({ state: "followup" })
        expect(yield* Effect.promise(() => alertsOf(earlier))).toEqual([
          expect.objectContaining({ id: earlier.alert.id, isResolved: false }),
        ])
      })
  )
})

// The app saves a deadline as midnight in Italy: 22:00 UTC of the day before
// in summer time, 23:00 UTC in winter time. The schedule runs at 23:47 UTC,
// past midnight in Italy all year, when the UTC day is still the one before
describe("processDueAlerts: il giorno è quello italiano", () => {
  const BUDGET_MS = 60_000

  const stateOf = async ({
    operator,
    customer,
  }: Awaited<ReturnType<typeof seedAlert>>) => {
    const [active] = await createTestCaller(operator).task.getActiveTask({
      id: customer.id,
    })
    return active?.state
  }

  it.effect.each([
    ["in ora legale", "2026-10-11T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-09T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    [
      "il giorno in cui torna l'ora solare",
      "2026-10-24T22:00:00.000Z",
      "2026-10-24T23:47:00.000Z",
    ],
    [
      "il giorno in cui torna l'ora legale",
      "2027-03-27T23:00:00.000Z",
      "2027-03-27T23:47:00.000Z",
    ],
    [
      "a un'ora qualsiasi della giornata",
      "2026-10-12T21:59:00.000Z",
      "2026-10-11T23:47:00.000Z",
    ],
    [
      "lanciato a mano di giorno",
      "2026-10-11T22:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    ],
  ])(
    "un alert che scade oggi crea il followup %s",
    ([_, deadline = "", now = ""]) =>
      Effect.gen(function* () {
        const seeded = yield* Effect.promise(() =>
          seedAlert(new Date(deadline))
        )
        expect(yield* run(BUDGET_MS, new Date(now))).toMatchObject({
          found: 1,
          processed: 1,
        })

        expect(yield* Effect.promise(() => stateOf(seeded))).toBe("followup")
      })
  )

  it.effect.each([
    ["in ora legale", "2026-10-10T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-08T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    [
      "lanciato a mano di giorno",
      "2026-10-10T22:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    ],
  ])(
    "un alert scaduto ieri si chiude senza followup %s",
    ([_, deadline = "", now = ""]) =>
      Effect.gen(function* () {
        const seeded = yield* Effect.promise(() =>
          seedAlert(new Date(deadline))
        )
        expect(yield* run(BUDGET_MS, new Date(now))).toMatchObject({
          found: 1,
          processed: 1,
        })

        expect(yield* Effect.promise(() => stateOf(seeded))).toBe("richiamare")
        expect(yield* Effect.promise(() => alertsOf(seeded))).toEqual([
          expect.objectContaining({ id: seeded.alert.id, isResolved: true }),
        ])
      })
  )

  it.effect.each([
    ["in ora legale", "2026-10-12T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-10T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    // Why the schedule isn't an hour earlier: in winter time Italy would still
    // be on the day that is ending
    [
      "un'ora prima dello schedule, in ora solare",
      "2026-11-09T23:00:00.000Z",
      "2026-11-09T22:47:00.000Z",
    ],
  ])(
    "un alert che scade domani resta aperto %s",
    ([_, deadline = "", now = ""]) =>
      Effect.gen(function* () {
        const seeded = yield* Effect.promise(() =>
          seedAlert(new Date(deadline))
        )
        expect(yield* run(BUDGET_MS, new Date(now))).toMatchObject({ found: 0 })

        expect(yield* Effect.promise(() => stateOf(seeded))).toBe("richiamare")
        expect(yield* Effect.promise(() => alertsOf(seeded))).toEqual([
          expect.objectContaining({ id: seeded.alert.id, isResolved: false }),
        ])
      })
  )
})
