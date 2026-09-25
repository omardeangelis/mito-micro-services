import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb, tasksOf } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// "Assegna Clienti" in the customers dashboard

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

async function seed() {
  const admin = await createOperator({ role: "ADMIN", name: "Admin" })
  const previousOperator = await createOperator({ name: "Precedente" })
  const nextOperator = await createOperator({ name: "Nuovo" })
  const caller = createTestCaller(admin)
  return { previousOperator, nextOperator, caller }
}

describe("customer.bulkUpdateCustomers", () => {
  it("assegna il cliente e la sua task più recente, se è da chiamare", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const current = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: current.id, operatorId: nextOperator.id }),
    ])
  })

  it("se nessun cliente scelto ha in cima una task da chiamare, non tocca nessuna task", async () => {
    const { previousOperator, nextOperator, caller } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const outcome = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "non interessato",
    })
    const other = await createCustomer({ operatorId: previousOperator.id })
    const otherTask = await createTask({
      customerId: other.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await caller.customer.bulkUpdateCustomers({
      operatorId: nextOperator.id,
      customerIds: [customer.id],
    })

    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: nextOperator.id })
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({
        id: outcome.id,
        operatorId: previousOperator.id,
      }),
    ])
    expect(await tasksOf(other.id)).toEqual([
      expect.objectContaining({
        id: otherTask.id,
        operatorId: previousOperator.id,
      }),
    ])
  })
})
