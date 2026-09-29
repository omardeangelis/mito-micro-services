import { beforeAll, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { alert } from "@/server/db/schema/task"
import {
  activeTasksOf,
  LEGACY_SCHEMA_TAG,
  migrateUpTo,
  testClient,
  testDb,
} from "@/test/db"
import { createAlert, createCustomer, createTask } from "@/test/factories"

// The cleanup closes alerts as resolved by the system operator, which G1
// creates in production. Without it they would be closed by nobody.

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
})

const appliedMigrations = async () => {
  const { rows } = await testClient.query<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM drizzle.__drizzle_migrations`
  )
  return rows[0]!.count
}

describe("contatti_cleanup senza operatore di sistema", () => {
  it("con alert da chiudere la migrazione si ferma, e il database resta com'era", async () => {
    const customer = await createCustomer()
    await createTask({ customerId: customer.id })
    await createTask({ customerId: customer.id })
    const inactive = await createTask({
      customerId: customer.id,
      isActive: false,
    })
    const open = await createAlert({
      taskId: inactive.id,
      deadline: new Date("2026-09-20T09:00:00.000Z"),
    })
    const migrationsBefore = await appliedMigrations()

    await expect(migrateUpTo()).rejects.toThrow(/system operator/)

    expect(await activeTasksOf(customer.id)).toHaveLength(2)
    const [row] = await testDb.select().from(alert).where(eq(alert.id, open.id))
    expect(row).toMatchObject({ isResolved: false, resolvedBy: null })
    // The migrator runs every pending migration in one transaction: none of
    // PR2's is recorded
    expect(await appliedMigrations()).toBe(migrationsBefore)
  })
})
