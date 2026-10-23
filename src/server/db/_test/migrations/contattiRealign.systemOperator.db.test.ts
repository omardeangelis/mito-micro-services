import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  BEFORE_REALIGN_SCHEMA_TAG,
  driverFailure,
  REALIGN_SCHEMA_TAG,
  migrateUpTo,
  resetDb,
  testClient,
  testDb,
} from "@/test/db"
import { createCustomer, createOperator, createTask } from "@/test/factories"

// The realignment writes one row of the log per contact it moves, as the
// system operator, which G1 creates in production. Without it the rows would
// have no actor: the migration stops instead, and with it the two migrations
// that go in the same transaction (`cron_run` and the index removals).

beforeAll(async () => {
  await migrateUpTo(BEFORE_REALIGN_SCHEMA_TAG)
})

beforeEach(async () => {
  await resetDb()
})

const appliedMigrations = async () => {
  const { rows } = await testClient.query<{ count: number }>(
    `SELECT count(*)::int AS "count" FROM drizzle.__drizzle_migrations`
  )
  return rows[0]!.count
}

/** What the two migrations before the realignment change. */
const batchState = async () => {
  const [{ rows: tables }, { rows: indexes }] = await Promise.all([
    testClient.query<{ present: boolean }>(
      `SELECT to_regclass('public."mito-deutsche_cron_run"') IS NOT NULL AS present`
    ),
    testClient.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'mito-deutsche_task'
         AND indexname IN ('task_operator_active_idx', 'task_priority_active_idx')
       ORDER BY indexname`
    ),
  ])
  return {
    cronRunTable: tables[0]!.present,
    indexes: indexes.map((row) => row.indexname),
  }
}

const GUARD_MESSAGE =
  /contatti_contact_realign: the system operator \(user_id = 'system'\) is missing, and there are contacts to move/

describe("contatti_contact_realign senza operatore di sistema", () => {
  it("con un contatto da spostare la migrazione si ferma con il suo messaggio, e il database resta com'era", async () => {
    const anna = await createOperator({ name: "Anna" })
    const bruno = await createOperator({ name: "Bruno" })
    const customer = await createCustomer({ operatorId: anna.id })
    await createTask({ customerId: customer.id, operatorId: bruno.id })
    const tasksBefore = await testDb.select().from(task).orderBy(asc(task.id))
    const migrationsBefore = await appliedMigrations()
    expect(await batchState()).toEqual({
      cronRunTable: false,
      indexes: ["task_operator_active_idx", "task_priority_active_idx"],
    })

    // The driver's error carries the failed statement, comments included,
    // which also says "system operator": the message is on the error it wraps
    await expect(driverFailure(migrateUpTo())).rejects.toThrow(GUARD_MESSAGE)

    expect(await testDb.select().from(task).orderBy(asc(task.id))).toEqual(
      tasksBefore
    )
    expect(await testDb.select().from(taskEventLog)).toEqual([])
    // The migrator runs every pending migration in one transaction: none of
    // the three is recorded, `cron_run` is not created and the indexes stay
    expect(await appliedMigrations()).toBe(migrationsBefore)
    expect(await batchState()).toEqual({
      cronRunTable: false,
      indexes: ["task_operator_active_idx", "task_priority_active_idx"],
    })
  })

  it("si ferma anche se i contatti da spostare sono solo senza operatore", async () => {
    const anna = await createOperator({ name: "Anna" })
    const customer = await createCustomer({ operatorId: anna.id })
    await createTask({ customerId: customer.id, operatorId: null })

    await expect(driverFailure(migrateUpTo())).rejects.toThrow(GUARD_MESSAGE)
  })

  it("senza contatti da spostare passa anche senza l'operatore di sistema, con le altre due migrazioni", async () => {
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

    // Up to the realignment: the migrations after it are not part of the case
    await migrateUpTo(REALIGN_SCHEMA_TAG)

    expect(await appliedMigrations()).toBe(migrationsBefore + 3)
    expect(await batchState()).toEqual({ cronRunTable: true, indexes: [] })
    expect(await testDb.select().from(taskEventLog)).toEqual([])
  })
})
