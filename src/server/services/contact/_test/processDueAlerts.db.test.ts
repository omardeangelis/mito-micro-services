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

const run = async (budgetMs: number) => {
  const exit = await runServer(processDueAlerts(NOW, { budgetMs }))
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
