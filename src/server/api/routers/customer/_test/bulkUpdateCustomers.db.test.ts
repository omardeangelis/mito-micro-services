import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { logOf, migrateUpTo, resetDb, tasksOf } from "@/test/db"
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

describe("customer.bulkUpdateCustomers, permessi (P7)", () => {
  it("un OPERATORE che la chiama riceve FORBIDDEN e nulla cambia", async () => {
    const { previousOperator, nextOperator } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const current = await createTask({
      customerId: customer.id,
      operatorId: previousOperator.id,
      state: "chiamare",
    })

    await expect(
      createTestCaller(previousOperator).customer.bulkUpdateCustomers({
        operatorId: nextOperator.id,
        customerIds: [customer.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(
      await createTestCaller(previousOperator).customer.getCustomerById({
        id: customer.id,
      })
    ).toMatchObject({ operatorId: previousOperator.id })
    expect(await tasksOf(customer.id)).toEqual([current])
    expect(await logOf(customer.id)).toEqual([])
  })
})

describe("customer.updateCustomer", () => {
  it("non esiste più", async () => {
    const { previousOperator, nextOperator } = await seed()
    const customer = await createCustomer({ operatorId: previousOperator.id })
    const procedures = createTestCaller(nextOperator)
      .customer as unknown as Record<
      string,
      ((input: unknown) => Promise<unknown>) | undefined
    >

    // Over HTTP tRPC answers NOT_FOUND; the server-side caller just throws
    await expect(async () =>
      procedures.updateCustomer!({
        id: customer.id,
        operatorId: nextOperator.id,
      })
    ).rejects.toThrow()
    expect(
      await createTestCaller(previousOperator).customer.getCustomerById({
        id: customer.id,
      })
    ).toMatchObject({ operatorId: previousOperator.id })
  })
})
