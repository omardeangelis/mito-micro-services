import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { LEGACY_SCHEMA_TAG, migrateUpTo, resetDb, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// Customers with more than one active task: the data PR2 cleans up. The schema
// stops before the unique index that forbids them.

const tasksOf = (customerId: string) =>
  testDb
    .select()
    .from(task)
    .where(eq(task.customerId, customerId))
    .orderBy(asc(task.id))

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
})

beforeEach(async () => {
  await resetDb()
})

describe("task.bulkHandleTask su un cliente con due task attive", () => {
  it("usa la task aggiornata più di recente, e oggi l'altra resta attiva", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const older = await createTask({
      customerId: customer.id,
      state: "app.to",
      closedAt: new Date("2026-09-01T09:00:00.000Z"),
      updatedAt: new Date("2026-09-01T09:00:00.000Z"),
    })
    const newer = await createTask({
      customerId: customer.id,
      state: "app.to",
      closedAt: new Date("2026-09-10T09:00:00.000Z"),
      updatedAt: new Date("2026-09-10T09:00:00.000Z"),
    })

    await createTestCaller(admin).task.bulkHandleTask({
      operatorId: operator.id,
      customerIds: [customer.id],
      state: "chiamare",
    })

    const rows = await tasksOf(customer.id)
    const created = rows.find(
      (row) => row.id !== older.id && row.id !== newer.id
    )
    expect(created).toMatchObject({
      isActive: true,
      state: "chiamare",
      closedAt: newer.closedAt,
    })
    expect(rows.find((row) => row.id === newer.id)).toMatchObject({
      isActive: false,
    })
    // DESTINATA A CAMBIARE IN T1.6: oggi il duplicato più vecchio resta
    // attivo; con replaceActiveContact si disattivano tutte
    expect(rows.find((row) => row.id === older.id)).toMatchObject({
      isActive: true,
    })
  })
})
