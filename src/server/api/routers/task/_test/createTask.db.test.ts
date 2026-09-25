import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"

const CLOSED_AT = new Date("2026-09-20T09:30:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.createTask", () => {
  it("su un cliente senza contatti crea una task attiva a priorità 120 e scrive il cambio di stato", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const caller = createTestCaller(operator)

    const created = await caller.task.createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "chiamare",
      closedAt: CLOSED_AT,
      source: "detail",
    })

    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toEqual(created)
    expect(active).toMatchObject({
      state: "chiamare",
      operatorId: operator.id,
      closedAt: CLOSED_AT,
      priority: 120,
      isActive: true,
    })
    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "state_change",
        source: "detail",
        taskId: created.id,
        actorOperatorId: operator.id,
        fromState: null,
        toState: "chiamare",
      }),
    ])
  })

  it("su un cliente che ha già un contatto attivo lascia attivo solo il nuovo e registra il cambio dallo stato precedente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const previous = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "non interessato",
      closedAt: CLOSED_AT,
    })

    const created = await createTestCaller(operator).task.createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "chiamare",
      closedAt: CLOSED_AT,
      source: "detail",
    })

    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "state_change",
        taskId: created.id,
        fromState: "non interessato",
        toState: "chiamare",
      }),
    ])
    // Changed in T1.7: before, both stayed active
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: previous.id, isActive: false }),
      expect.objectContaining({ id: created.id, isActive: true }),
    ])
  })

  it("senza cliente risponde BAD_REQUEST e non scrive nulla", async () => {
    const operator = await createOperator()

    await expect(
      createTestCaller(operator).task.createTask({
        operatorId: operator.id,
        state: "chiamare",
        source: "detail",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      createTestCaller(operator).task.createTask({
        customerId: "missing-customer",
        operatorId: operator.id,
        state: "chiamare",
        source: "detail",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(await testDb.select().from(task)).toEqual([])
    expect(await testDb.select().from(taskEventLog)).toEqual([])
  })
})

describe("task.bulkCreateTask", () => {
  it("non esiste più", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const customer = await createCustomer()
    const procedures = createTestCaller(admin).task as unknown as Record<
      string,
      ((input: unknown) => Promise<unknown>) | undefined
    >

    // Over HTTP tRPC answers NOT_FOUND; the server-side caller just throws
    await expect(async () =>
      procedures.bulkCreateTask!({
        operatorId: admin.id,
        customerIds: [customer.id],
      })
    ).rejects.toThrow()
    expect(await testDb.select().from(task)).toEqual([])
  })
})
