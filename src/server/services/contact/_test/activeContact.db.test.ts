import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { task } from "@/server/db/schema/task"
import { lockCustomer, transaction } from "@/server/effect/db"
import { replaceActiveContact } from "@/server/services/contact/activeContact"
import { activeTasksOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"
import { failureTag, runServer } from "@/test/effect"

// As the callers do: lock the customer, then replace its contact
const replaceExit = (customerId: string, operatorId?: number) =>
  runServer(
    transaction(
      Effect.flatMap(lockCustomer(customerId), (customer) =>
        replaceActiveContact({
          customer,
          values: { state: "chiamare", operatorId, priority: 120 },
        })
      )
    )
  )

const replace = async (customerId: string, operatorId?: number) => {
  const exit = await replaceExit(customerId, operatorId)
  if (exit._tag === "Failure") throw new Error("replaceActiveContact failed")
  return exit.value
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("replaceActiveContact", () => {
  it("un cliente senza task, dopo replaceActiveContact, ha un solo contatto attivo: quello creato", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })

    const { created, previous } = await replace(customer.id, operator.id)

    expect(previous).toBeNull()
    expect(created).toMatchObject({
      customerId: customer.id,
      state: "chiamare",
      operatorId: operator.id,
      priority: 120,
      isActive: true,
    })
    const [active] = await createTestCaller(operator).task.getActiveTask({
      id: customer.id,
    })
    expect(active).toEqual(created)
    expect(await activeTasksOf(customer.id)).toHaveLength(1)
  })

  it("un cliente con una task attiva: la precedente non è più attiva e torna come previous", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const existing = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "app.to",
    })

    const { created, previous } = await replace(customer.id, operator.id)

    expect(previous).toMatchObject({
      id: existing.id,
      state: "app.to",
      isActive: false,
    })
    expect(await activeTasksOf(customer.id)).toEqual([created])
  })

  it("un cliente inesistente fallisce con CustomerMissing senza scrivere nulla", async () => {
    const exit = await replaceExit("missing-customer")

    expect(failureTag(exit)).toBe("CustomerMissing")
    expect(await testDb.select().from(task)).toEqual([])
  })

  it("se l'insert fallisce il DB resta com'era e il chiamante riceve un DbError", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const existing = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "app.to",
    })
    await failNextInsertInto(task)

    const exit = await replaceExit(customer.id, operator.id)

    expect(failureTag(exit)).toBe("DbError")
    expect(await tasksOf(customer.id)).toEqual([existing])
  })
})
