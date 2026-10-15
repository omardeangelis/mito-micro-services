import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { readContactError } from "@/lib/domain/contact/errors"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"

const longAgo = new Date("2026-01-01T00:00:00Z")

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail")
    },
    (caught: unknown) => caught
  )

const customerRow = async (id: string) =>
  (await testDb.select().from(customers).where(eq(customers.id, id)))[0]!

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.setPriority", () => {
  it("impostare 'alta' salva priorità 100 con customPriority=true", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      priority: 40,
      customPriority: false,
    })

    await createTestCaller(operator).task.setPriority({
      taskId: contact.id,
      priority: "high",
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, priority: 100, customPriority: true },
    ])
  })

  it.each([
    ["low", 20],
    ["medium", 60],
    ["high", 100],
    ["urgent", 120],
  ] as const)(
    "la fascia '%s' salva priorità %i con customPriority=true (AC42)",
    async (band, value) => {
      const operator = await createOperator()
      const customer = await createCustomer({ operatorId: operator.id })
      const contact = await createTask({
        customerId: customer.id,
        operatorId: operator.id,
        priority: 40,
        customPriority: false,
      })

      await createTestCaller(operator).task.setPriority({
        taskId: contact.id,
        priority: band,
      })

      expect(await tasksOf(customer.id)).toMatchObject([
        { id: contact.id, priority: value, customPriority: true },
      ])
    }
  )

  it("'auto' su un contatto manuale a 120 azzera solo customPriority e lascia il valore (AC43, D3)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      priority: 120,
      customPriority: true,
    })

    await createTestCaller(operator).task.setPriority({
      taskId: contact.id,
      priority: "auto",
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, priority: 120, customPriority: false },
    ])
  })

  it("non scrive righe di log e non cambia customers.updated_at", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    const caller = createTestCaller(operator)

    await caller.task.setPriority({ taskId: contact.id, priority: "urgent" })
    await caller.task.setPriority({ taskId: contact.id, priority: "auto" })

    expect(await logOf(customer.id)).toEqual([])
    expect((await customerRow(customer.id)).updatedAt).toEqual(longAgo)
  })

  it("rifiuta un contatto non più attivo con CONTACT_SUPERSEDED e non modifica nulla (AC27)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      priority: 40,
      customPriority: false,
    })
    await testDb
      .update(task)
      .set({ isActive: false })
      .where(eq(task.id, contact.id))
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    const before = await tasksOf(customer.id)

    const error = await failure(
      createTestCaller(operator).task.setPriority({
        taskId: contact.id,
        priority: "high",
      })
    )

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: active.id },
    })
    expect(await tasksOf(customer.id)).toEqual(before)
  })

  it("rifiuta un operatore a cui non appartengono né il contatto né il cliente e non modifica nulla (AC49)", async () => {
    const owner = await createOperator()
    const assignee = await createOperator({ name: "Luigi", surname: "Verdi" })
    const stranger = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    await createTask({
      customerId: customer.id,
      operatorId: assignee.id,
      priority: 40,
      customPriority: false,
    })
    const before = await tasksOf(customer.id)

    const error = await failure(
      createTestCaller(stranger).task.setPriority({
        taskId: before[0]!.id,
        priority: "high",
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Luigi Verdi" },
    })
    expect(await tasksOf(customer.id)).toEqual(before)
  })

  it("l'operatore del cliente imposta la priorità del contatto di un collega (D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
      priority: 40,
      customPriority: false,
    })

    await createTestCaller(me).task.setPriority({
      taskId: contact.id,
      priority: "medium",
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      {
        id: contact.id,
        operatorId: colleague.id,
        priority: 60,
        customPriority: true,
      },
    ])
  })

  it("rifiuta un valore di priorità non valido con BAD_REQUEST", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      priority: 40,
      customPriority: false,
    })

    await expect(
      createTestCaller(operator).task.setPriority({
        taskId: contact.id,
        // @ts-expect-error not a band
        priority: "max",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, priority: 40, customPriority: false },
    ])
  })
})
