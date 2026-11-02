import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  LEGACY_SCHEMA_TAG,
  migrateUpTo,
  resetDb,
  tasksOf,
  testClient,
} from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// Customers with more than one active task: the data PR2 cleans up. The schema
// stops before the unique index that forbids them.

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
  // The code of today reads the users' disabled columns (gestione-operatori),
  // which come with a later migration: only they are added here
  await testClient.exec(
    `ALTER TABLE "mito-deutsche_user" ADD COLUMN "disabled_at" timestamp with time zone, ADD COLUMN "disabled_by" integer`
  )
  // Same for the registry of the calls: the code of today writes the columns
  // of the log and of the alerts that come with a later migration (T2), and
  // only they are added here
  await testClient.exec(`
    CREATE TYPE "public"."call_origin" AS ENUM('alert', 'list');
    CREATE TYPE "public"."alert_resolution" AS ENUM('call', 'replaced', 'removed', 'state_change', 'bulk', 'system');
    ALTER TABLE "mito-deutsche_task_event_log" ADD COLUMN "outcome" "task_status", ADD COLUMN "origin" "call_origin", ADD COLUMN "request_id" uuid;
    ALTER TABLE "mito-deutsche_alert" ADD COLUMN "resolved_at" timestamp with time zone, ADD COLUMN "resolution" "alert_resolution"
  `)
})

beforeEach(async () => {
  await resetDb()
})

describe("task.bulkHandleTask su un cliente con due task attive", () => {
  it("usa la task aggiornata più di recente e disattiva anche l'altra", async () => {
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
    // Changed in T1.6: before replaceActiveContact the older one stayed active
    expect(rows.find((row) => row.id === older.id)).toMatchObject({
      isActive: false,
    })
  })
})
