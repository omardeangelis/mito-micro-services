import { beforeAll, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  BEFORE_REALIGN_SCHEMA_TAG,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// The realignment writes one row of the log per contact it moves, as the
// system operator, which G1 creates in production. Without it the rows would
// have no actor: the migration stops instead.

beforeAll(async () => {
  await migrateUpTo(BEFORE_REALIGN_SCHEMA_TAG)
})

const appliedMigrations = async () => {
  const { rows } = await testClient.query<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM drizzle.__drizzle_migrations`
  )
  return rows[0]!.count
}

describe("contatti_contact_realign senza operatore di sistema", () => {
  it("con contatti da spostare la migrazione si ferma, e il database resta com'era", async () => {
    const anna = await createOperator({ name: "Anna" })
    const bruno = await createOperator({ name: "Bruno" })
    const customer = await createCustomer({ operatorId: anna.id })
    await createTask({ customerId: customer.id, operatorId: bruno.id })
    const tasksBefore = await testDb.select().from(task).orderBy(asc(task.id))
    const migrationsBefore = await appliedMigrations()

    // The migration's own message: the driver's error carries the text of the
    // failed statement, comments included, and a comment also says "system
    // operator"
    await expect(migrateUpTo()).rejects.toThrow(
      /contatti_contact_realign: the system operator/
    )

    expect(await testDb.select().from(task).orderBy(asc(task.id))).toEqual(
      tasksBefore
    )
    expect(await testDb.select().from(taskEventLog)).toEqual([])
    // The migrator runs every pending migration in one transaction: the
    // realignment is not recorded
    expect(await appliedMigrations()).toBe(migrationsBefore)
  })

  it("senza contatti da spostare passa anche senza l'operatore di sistema", async () => {
    await resetDb()
    const anna = await createOperator({ name: "Anna" })
    const bruno = await createOperator({ name: "Bruno" })
    const aligned = await createCustomer({ operatorId: anna.id })
    await createTask({ customerId: aligned.id, operatorId: anna.id })
    // Cases the migration leaves as they are
    const noCustomerOperator = await createCustomer({ operatorId: null })
    await createTask({
      customerId: noCustomerOperator.id,
      operatorId: bruno.id,
    })
    await createTask({
      customerId: aligned.id,
      operatorId: bruno.id,
      isActive: false,
    })
    const migrationsBefore = await appliedMigrations()

    await migrateUpTo()

    expect(await appliedMigrations()).toBe(migrationsBefore + 1)
    expect(await testDb.select().from(taskEventLog)).toEqual([])
  })
})
