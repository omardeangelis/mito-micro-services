import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { transaction } from "@/server/effect/db"
import { replaceActiveContact } from "@/server/services/contact/activeContact"
import { LEGACY_SCHEMA_TAG, migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import { runServer } from "@/test/effect"

// Customers with more than one active task: the data PR2 cleans up. The schema
// stops before the unique index that forbids them.

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
})

beforeEach(async () => {
  await resetDb()
})

describe("replaceActiveContact su un cliente con due task attive", () => {
  it("le disattiva entrambe e restituisce come previous la più recente", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    await createTask({
      customerId: customer.id,
      state: "app.to",
      updatedAt: new Date("2026-09-01T09:00:00.000Z"),
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
    })
    const newer = await createTask({
      customerId: customer.id,
      state: "richiamare",
      updatedAt: new Date("2026-09-10T09:00:00.000Z"),
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
    })

    const exit = await runServer(
      transaction(
        replaceActiveContact({
          customerId: customer.id,
          values: { state: "chiamare", operatorId: operator.id },
        })
      )
    )
    if (exit._tag === "Failure") throw new Error("replaceActiveContact failed")
    const { created, previous } = exit.value

    expect(previous).toMatchObject({ id: newer.id, state: "richiamare" })
    expect(
      await testDb
        .select()
        .from(task)
        .where(and(eq(task.customerId, customer.id), eq(task.isActive, true)))
    ).toEqual([created])
  })
})
