import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { processDueAlerts } from "@/server/services/contact/processDueAlerts"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { runServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

const NOW = new Date("2026-09-25T06:00:00.000Z")
const EARLIER_DAY = new Date("2026-09-20T08:00:00.000Z")

const run = async (budgetMs: number, now = NOW) => {
  const exit = await runServer(processDueAlerts(now, { budgetMs }))
  if (exit._tag === "Failure") throw new Error("processDueAlerts failed")
  return exit.value
}

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
  it("a tempo esaurito elabora solo il primo alert: gli altri restano aperti e li prende la chiamata dopo", async () => {
    const first = await seedAlert(EARLIER_DAY)
    const second = await seedAlert(EARLIER_DAY)

    expect(await run(0)).toEqual({
      found: 2,
      processed: 1,
      skipped: 0,
      failed: 0,
      remaining: 1,
    })
    expect(await run(0)).toEqual({
      found: 1,
      processed: 1,
      skipped: 0,
      failed: 0,
      remaining: 0,
    })
    for (const seeded of [first, second]) {
      expect(await alertsOf(seeded)).toEqual([
        expect.objectContaining({ id: seeded.alert.id, isResolved: true }),
      ])
    }
  })

  it("prende prima gli alert che scadono oggi, gli unici che creano il followup", async () => {
    // Created first: in table order it would be taken first
    const earlier = await seedAlert(EARLIER_DAY)
    const today = await seedAlert(new Date("2026-09-25T08:00:00.000Z"))

    expect(await run(0)).toMatchObject({ processed: 1, remaining: 1 })

    const [active] = await createTestCaller(today.operator).task.getActiveTask({
      id: today.customer.id,
    })
    expect(active).toMatchObject({ state: "followup" })
    expect(await alertsOf(earlier)).toEqual([
      expect.objectContaining({ id: earlier.alert.id, isResolved: false }),
    ])
  })
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

  it.each([
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
    async (_, deadline, now) => {
      const seeded = await seedAlert(new Date(deadline))

      expect(await run(BUDGET_MS, new Date(now))).toMatchObject({
        found: 1,
        processed: 1,
      })

      expect(await stateOf(seeded)).toBe("followup")
    }
  )

  it.each([
    ["in ora legale", "2026-10-10T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-08T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    [
      "lanciato a mano di giorno",
      "2026-10-10T22:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    ],
  ])(
    "un alert scaduto ieri si chiude senza followup %s",
    async (_, deadline, now) => {
      const seeded = await seedAlert(new Date(deadline))

      expect(await run(BUDGET_MS, new Date(now))).toMatchObject({
        found: 1,
        processed: 1,
      })

      expect(await stateOf(seeded)).toBe("richiamare")
      expect(await alertsOf(seeded)).toEqual([
        expect.objectContaining({ id: seeded.alert.id, isResolved: true }),
      ])
    }
  )

  it.each([
    ["in ora legale", "2026-10-12T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-10T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    // Why the schedule isn't an hour earlier: in winter time Italy would still
    // be on the day that is ending
    [
      "un'ora prima dello schedule, in ora solare",
      "2026-11-09T23:00:00.000Z",
      "2026-11-09T22:47:00.000Z",
    ],
  ])("un alert che scade domani resta aperto %s", async (_, deadline, now) => {
    const seeded = await seedAlert(new Date(deadline))

    expect(await run(BUDGET_MS, new Date(now))).toMatchObject({ found: 0 })

    expect(await stateOf(seeded)).toBe("richiamare")
    expect(await alertsOf(seeded)).toEqual([
      expect.objectContaining({ id: seeded.alert.id, isResolved: false }),
    ])
  })
})
