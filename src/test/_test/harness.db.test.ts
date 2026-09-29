import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { task } from "@/server/db/schema/task"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createTask,
  createUser,
} from "@/test/factories"
import { failNextInsertInto } from "@/test/failpoint"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("harness di test su PGlite", () => {
  it("un OPERATORE legge la propria task attiva via createCaller", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const created = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "chiamare",
    })

    const [active] = await createTestCaller(operator).task.getActiveTask({
      id: customer.id,
    })

    expect(active).toMatchObject({
      id: created.id,
      state: "chiamare",
      isActive: true,
    })
  })

  it("un utente senza operatore riceve BAD_REQUEST", async () => {
    const user = await createUser()
    const customer = await createCustomer()

    await expect(
      createTestCaller(user).task.getActiveTask({ id: customer.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("failNextInsertInto fa fallire solo il prossimo insert sulla tabella", async () => {
    const customer = await createCustomer()
    await failNextInsertInto(task)

    await expect(createTask({ customerId: customer.id })).rejects.toThrow(
      /failpoint/
    )
    await expect(createTask({ customerId: customer.id })).resolves.toBeDefined()
  })

  it("failNextInsertInto con una condizione fa fallire solo l'insert che la soddisfa", async () => {
    const first = await createCustomer()
    const second = await createCustomer()
    await failNextInsertInto(task, { customer_id: second.id })

    await expect(createTask({ customerId: first.id })).resolves.toBeDefined()
    await expect(createTask({ customerId: second.id })).rejects.toThrow(
      /failpoint/
    )
    await expect(createTask({ customerId: second.id })).resolves.toBeDefined()
  })

  it("resetDb toglie i failpoint", async () => {
    await failNextInsertInto(task)
    await resetDb()
    const customer = await createCustomer()

    await expect(createTask({ customerId: customer.id })).resolves.toBeDefined()
  })
})
