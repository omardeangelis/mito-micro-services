import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// "Passaggio di consegne" and "Assegna Clienti" check their target like the
// other assignments: a deactivated operator is not one someone can work as
// (gestione-operatori, AC15)

const customerRow = async (customerId: string) =>
  (
    await testDb.select().from(customers).where(eq(customers.id, customerId))
  )[0]!

/** The error a rejected call throws. */
const rejectionOf = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error("the call did not fail")
    },
    (caught: unknown) => caught
  )

/** A customer of `operatorId` with an active contact of the same operator. */
const customerWithContact = async (operatorId: number) => {
  const customer = await createCustomer({ operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state: "richiamare",
  })
  return { customer, contact }
}

/** Customer and contact keep their operators, and nothing was logged. */
const expectUntouched = async ({
  customer,
  contact,
}: Awaited<ReturnType<typeof customerWithContact>>) => {
  expect((await customerRow(customer.id)).operatorId).toBe(customer.operatorId)
  expect(await tasksOf(customer.id)).toEqual([contact])
  expect(await logOf(customer.id)).toEqual([])
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("customer.handover verso un operatore disattivato", () => {
  it("riceve OPERATOR_NOT_FOUND e nulla cambia", async () => {
    const owner = await createOperator()
    const disabled = await createOperator({ disabledAt: new Date() })
    const seeded = await customerWithContact(owner.id)

    const error = await rejectionOf(
      createTestCaller(owner).customer.handover({
        customerId: seeded.customer.id,
        toOperatorId: disabled.id,
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(readContactError(error)).toEqual({
      code: "OPERATOR_NOT_FOUND",
      payload: {},
    })
    await expectUntouched(seeded)
  })

  it("un OPERATORE su un cliente di un collega riceve ancora CUSTOMER_ASSIGNMENT_FORBIDDEN, prima del destinatario", async () => {
    const operator = await createOperator()
    const colleague = await createOperator()
    const disabled = await createOperator({ disabledAt: new Date() })
    const seeded = await customerWithContact(colleague.id)

    const error = await rejectionOf(
      createTestCaller(operator).customer.handover({
        customerId: seeded.customer.id,
        toOperatorId: disabled.id,
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CUSTOMER_ASSIGNMENT_FORBIDDEN",
      payload: {},
    })
    await expectUntouched(seeded)
  })
})

describe("customer.bulkUpdateCustomers verso un operatore disattivato", () => {
  it("riceve OPERATOR_NOT_FOUND e nessun cliente cambia", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const previous = await createOperator()
    const disabled = await createOperator({ disabledAt: new Date() })
    const first = await customerWithContact(previous.id)
    const second = await customerWithContact(previous.id)

    const error = await rejectionOf(
      createTestCaller(admin).customer.bulkUpdateCustomers({
        operatorId: disabled.id,
        customerIds: [first.customer.id, second.customer.id],
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(readContactError(error)).toEqual({
      code: "OPERATOR_NOT_FOUND",
      payload: {},
    })
    await expectUntouched(first)
    await expectUntouched(second)
  })
})
