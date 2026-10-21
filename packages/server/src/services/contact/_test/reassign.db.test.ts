import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { eq } from "drizzle-orm"
import { readContactError } from "@mito/domain/contact/errors"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { runServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import { reassign } from "../reassign"

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

describe("task.reassign", () => {
  it("un admin che riassegna un contatto aggiorna l'operatore del contatto e del cliente e scrive operator_reassign", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      state: "app.to",
    })
    const caller = createTestCaller(admin)

    await caller.task.reassign({ taskId: contact.id, operatorId: colleague.id })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id, state: "app.to" },
    ])
    expect(
      await caller.customer.getCustomerById({ id: customer.id })
    ).toMatchObject({ operatorId: colleague.id })
    const log = await logOf(customer.id)
    expect(log).toHaveLength(2)
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "operator_reassign",
          source: "detail",
          taskId: contact.id,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
          actorOperatorId: admin.id,
        }),
        expect.objectContaining({
          action: "operator_reassign",
          source: "detail",
          taskId: null,
          fromOperatorId: owner.id,
          toOperatorId: colleague.id,
          actorOperatorId: admin.id,
        }),
      ])
    )
  })

  it("con il contatto già dell'operatore scelto allinea solo il cliente, con una riga senza taskId", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
    })

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id },
    ])
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: colleague.id,
    })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "operator_reassign",
        source: "detail",
        taskId: null,
        fromOperatorId: owner.id,
        toOperatorId: colleague.id,
        actorOperatorId: admin.id,
      }),
    ])
  })

  it("con il cliente già dell'operatore scelto sposta solo il contatto, con una riga operator_reassign sul contatto", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: colleague.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, operatorId: colleague.id },
    ])
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: colleague.id,
    })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "operator_reassign",
        source: "detail",
        taskId: contact.id,
        fromOperatorId: owner.id,
        toOperatorId: colleague.id,
        actorOperatorId: admin.id,
      }),
    ])
  })

  it("con contatto e cliente già dell'operatore scelto non scrive nulla", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const customer = await createCustomer({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })
    const before = await tasksOf(customer.id)

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: owner.id,
    })

    expect(await tasksOf(customer.id)).toEqual(before)
    expect(await logOf(customer.id)).toEqual([])
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
  })

  it("rifiuta un operatore, anche quello del contatto, e non modifica nulla (AC50)", async () => {
    const owner = await createOperator()
    const colleague = await createOperator()
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
      createTestCaller(owner).task.reassign({
        taskId: contact.id,
        operatorId: colleague.id,
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(await tasksOf(customer.id)).toEqual(before)
    expect(await logOf(customer.id)).toEqual([])
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
  })

  it("il servizio rifiuta da solo un OPERATORE che è l'operatore del cliente con ContactForbidden e non modifica nulla (AC50)", async () => {
    const owner = await createOperator({ name: "Anna", surname: "Bianchi" })
    const colleague = await createOperator()
    const customer = await createCustomer({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })
    const before = await tasksOf(customer.id)

    const exit = await runServer(
      reassign({
        taskId: contact.id,
        operatorId: colleague.id,
        actor: { operatorId: owner.id, role: "OPERATORE" },
      })
    )

    expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
      error: { _tag: "ContactForbidden", assignee: "Anna Bianchi" },
    })
    expect(await tasksOf(customer.id)).toEqual(before)
    expect(await logOf(customer.id)).toEqual([])
    expect(await customerRow(customer.id)).toMatchObject({
      operatorId: owner.id,
      updatedAt: longAgo,
    })
  })

  it.each([
    ["che non esiste", async () => -1],
    ["di sistema, senza utente", async () => (await createSystemOperator()).id],
  ])(
    "rifiuta un operatore %s con OPERATOR_NOT_FOUND e non modifica nulla",
    async (_, targetId) => {
      const admin = await createOperator({ role: "ADMIN" })
      const owner = await createOperator()
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
          operatorId: await targetId(),
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "OPERATOR_NOT_FOUND",
        payload: {},
      })
      expect(await tasksOf(customer.id)).toEqual(before)
      expect(await logOf(customer.id)).toEqual([])
      expect(await customerRow(customer.id)).toMatchObject({
        operatorId: owner.id,
        updatedAt: longAgo,
      })
    }
  )

  it("rifiuta un contatto non più attivo con CONTACT_SUPERSEDED (AC27)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const old = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      isActive: false,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })
    const before = await tasksOf(customer.id)

    const error = await failure(
      createTestCaller(admin).task.reassign({
        taskId: old.id,
        operatorId: colleague.id,
      })
    )

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: active.id },
    })
    expect(await tasksOf(customer.id)).toEqual(before)
    expect(await logOf(customer.id)).toEqual([])
  })

  it("lascia invariati stato e closedAt del contatto", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      state: "erogata",
      closedAt: longAgo,
    })

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      {
        id: contact.id,
        operatorId: colleague.id,
        state: "erogata",
        closedAt: longAgo,
      },
    ])
  })

  it("aggiorna updated_at del cliente quando qualcosa cambia", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({
      operatorId: colleague.id,
      updatedAt: longAgo,
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })

    await createTestCaller(admin).task.reassign({
      taskId: contact.id,
      operatorId: colleague.id,
    })

    expect(
      (await customerRow(customer.id)).updatedAt.getTime()
    ).toBeGreaterThan(longAgo.getTime())
  })
})
