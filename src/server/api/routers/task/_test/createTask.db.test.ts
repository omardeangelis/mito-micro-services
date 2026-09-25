import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"

const tasksOf = (customerId: string) =>
  testDb
    .select()
    .from(task)
    .where(eq(task.customerId, customerId))
    .orderBy(asc(task.id))

const logOf = (customerId: string) =>
  testDb
    .select()
    .from(taskEventLog)
    .where(eq(taskEventLog.customerId, customerId))
    .orderBy(asc(taskEventLog.id))

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
        taskId: created!.id,
        actorOperatorId: operator.id,
        fromState: null,
        toState: "chiamare",
      }),
    ])
  })

  it("su un cliente che ha già un contatto attivo registra il cambio dallo stato precedente", async () => {
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
        taskId: created!.id,
        fromState: "non interessato",
        toState: "chiamare",
      }),
    ])
    // DESTINATA A CAMBIARE IN T1.7: oggi restano attive tutte e due; dopo
    // resta attiva solo quella nuova
    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: previous.id, isActive: true }),
      expect.objectContaining({ id: created!.id, isActive: true }),
    ])
  })
})
