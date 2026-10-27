import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { assignToYourself } from "../../../../services/customer/assignment"

// "Passaggio di consegne", "Assegna Clienti" and "Assegna a te" check their
// target like the other assignments: a deactivated operator is not one someone
// can work as (gestione-operatori, AC7, AC15)

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

describe("assignToYourself di un operatore disattivato", () => {
  // The middleware already stops a disabled operator: the service's own check
  // covers one deactivated while the call runs (gestione-operatori, AC7)
  it.effect("riceve OperatorNotFound e il cliente resta senza operatore", () =>
    Effect.gen(function* () {
      const disabled = yield* Effect.promise(() =>
        createOperator({ disabledAt: new Date() })
      )
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: null })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: null,
        })
      )

      const exit = yield* assignToYourself({
        customerId: customer.id,
        actor: { role: "OPERATORE", operatorId: disabled.id },
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("OperatorNotFound")
      yield* Effect.promise(() => expectUntouched({ customer, contact }))
    })
  )

  it.effect(
    "su un cliente inesistente riceve ancora CustomerNotFound, prima del proprio stato",
    () =>
      Effect.gen(function* () {
        const disabled = yield* Effect.promise(() =>
          createOperator({ disabledAt: new Date() })
        )

        const exit = yield* assignToYourself({
          customerId: "missing",
          actor: { role: "OPERATORE", operatorId: disabled.id },
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("CustomerNotFound")
      })
  )
})
