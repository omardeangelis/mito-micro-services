import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// The reassignment of a contact checks its target like the assignments: a
// deactivated operator is not one someone can work as (gestione-operatori,
// AC15)

const longAgo = new Date("2026-01-01T00:00:00Z")

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail")
    },
    (caught: unknown) => caught
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.reassign verso un operatore disattivato", () => {
  it("riceve OPERATOR_NOT_FOUND e non modifica nulla", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const disabled = await createOperator({ disabledAt: new Date() })
    const customer = await createCustomer({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })
    const before = await tasksOf(customer.id)

    const error = await failure(
      createTestCaller(admin).task.reassign({
        taskId: contact.id,
        operatorId: disabled.id,
      })
    )

    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      cause: { code: "OPERATOR_NOT_FOUND" },
    })
    expect(await tasksOf(customer.id)).toEqual(before)
    expect(await logOf(customer.id)).toEqual([])
    expect(
      (
        await testDb
          .select()
          .from(customers)
          .where(eq(customers.id, customer.id))
      )[0]
    ).toMatchObject({ operatorId: owner.id, updatedAt: longAgo })
  })

  it("un OPERATORE riceve ancora FORBIDDEN, prima del destinatario (AC50)", async () => {
    const owner = await createOperator()
    const disabled = await createOperator({ disabledAt: new Date() })
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })

    const error = await failure(
      createTestCaller(owner).task.reassign({
        taskId: contact.id,
        operatorId: disabled.id,
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(await logOf(customer.id)).toEqual([])
  })
})
