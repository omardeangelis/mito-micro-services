import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb, tasksOf } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"

// "Assegna chiamate" checks its target like the other assignments: a
// deactivated operator is not one someone can work as (gestione-operatori, AC15)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.bulkHandleTask verso un operatore disattivato", () => {
  it("riceve OperatorNotFound e non crea contatti", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const disabled = await createOperator({ disabledAt: new Date() })
    const customer = await createCustomer({ operatorId: admin.id })

    await expect(
      createTestCaller(admin).task.bulkHandleTask({
        operatorId: disabled.id,
        customerIds: [customer.id],
        state: "chiamare",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
    expect(await tasksOf(customer.id)).toHaveLength(0)
  })
})
