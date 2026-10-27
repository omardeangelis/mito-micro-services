import path from "path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { and, asc, eq } from "drizzle-orm"
import { driverError } from "@mito/db/driverError"
import { migrateWithPushedSchema } from "@mito/db/pushedSchema"
import * as schema from "@mito/db/schema/index"

const MIGRATIONS_FOLDER = path.resolve(
  __dirname,
  "../../packages/db/migrations"
)

/**
 * Last migration before the unique index on active contacts (PR2). Tests that
 * seed dirty data (more than one active task per customer) migrate up to here,
 * so they keep working once that index exists.
 */
export const LEGACY_SCHEMA_TAG = "20260902181440_nebulous_susan_delgado"

/**
 * Last of the PR2 migrations (cleanup, unique index, operator realignment).
 * Their tests migrate from `LEGACY_SCHEMA_TAG` up to here, as `db:migrate:prod`
 * ran them: a later migration may change the rows they compare.
 */
export const CONTATTI_SCHEMA_TAG = "20260929062408_contatti_operator_realign"

/**
 * The PR6 realignment of the active contacts (T6.9), and the last migration
 * production has before the release: three are pending there (`cron_run`, the
 * index removals and the realignment), which `db:migrate:prod` applies in one
 * transaction. Its tests migrate from the one to the other, so the same three
 * run together; a later migration may change the rows they compare.
 */
export const BEFORE_REALIGN_SCHEMA_TAG =
  "20261011200758_task_updated_at_default"
export const REALIGN_SCHEMA_TAG = "20261021100457_contatti_contact_realign"

/**
 * The tables of better-auth (spec auth-better-auth, T2), the migration before
 * the one that fills them from NextAuth's rows: its test seeds here.
 */
export const AUTH_TABLES_SCHEMA_TAG = "20261026174610_auth_tables"

/**
 * The last migration before the foreign key of `messages.chat_id` (TD10 c):
 * its test seeds here.
 */
export const AUTH_DATA_SCHEMA_TAG = "20261026174632_auth_data"

/**
 * The last migration before better-auth serves the login (PR C2), when the
 * copy of NextAuth's rows runs again: its test seeds here.
 */
export const BEFORE_AUTH_SWITCH_SCHEMA_TAG = "20261026221823_messages_chat_fk"

/** In-memory Postgres standing in for `@mito/db` in `*.db.test.ts` files. */
export const testClient = new PGlite()
export const testDb = drizzle(testClient, { schema })

/**
 * Applies the repo migrations to the test database, together with the pushed
 * schema production has (`migrateWithPushedSchema`): all of them, or only up
 * to `tag`. Call it once per test file, in `beforeAll`; a later call applies
 * only what is missing, as a migration of a database already in use (seed with
 * `migrateUpTo(previous)`, then `migrateUpTo()`).
 */
export async function migrateUpTo(tag?: string) {
  // The session time zone decides DATE() of a timestamptz. The databases in
  // use run in Europe/Rome: in UTC, a query that leans on the session for its
  // days shows in the tests (the alert cron's names the time zone)
  await testClient.exec(`SET TIME ZONE 'UTC'`)
  await migrateWithPushedSchema({
    folder: MIGRATIONS_FOLDER,
    upTo: tag,
    migrate: (migrationsFolder) => migrate(testDb, { migrationsFolder }),
    exec: (sql) => testClient.exec(sql),
  })
}

/**
 * Runs `sql`, one or more statements, in a read-only transaction: a write
 * fails it. Returns the rows of each statement.
 */
export async function queryReadOnly(sql: string) {
  const results = await testClient.transaction(async (tx) => {
    await tx.exec("SET TRANSACTION READ ONLY")
    return tx.exec(sql)
  })
  return results.map(({ rows }) => rows as Record<string, unknown>[])
}

/** Where `failNextInsertInto` (src/test/failpoint.ts) keeps its objects. */
export const FAILPOINT_SCHEMA = "test_failpoints"

/** Removes the failpoints and empties every table of the `public` schema. */
export async function resetDb() {
  // CASCADE drops the triggers that call the failpoint functions
  await testClient.exec(`DROP SCHEMA IF EXISTS ${FAILPOINT_SCHEMA} CASCADE`)
  const { rows } = await testClient.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  )
  if (rows.length === 0) return
  const tables = rows.map(({ tablename }) => `"public"."${tablename}"`)
  await testClient.exec(
    `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`
  )
}

// Inactive task rows and the event log are what the calls export reads: no
// public query returns them, so tests read the tables

/** Every task of the customer, oldest first. */
export const tasksOf = (customerId: string) =>
  testDb
    .select()
    .from(schema.task)
    .where(eq(schema.task.customerId, customerId))
    .orderBy(asc(schema.task.id))

/** The customer's active tasks, oldest first. */
export const activeTasksOf = (customerId: string) =>
  testDb
    .select()
    .from(schema.task)
    .where(
      and(
        eq(schema.task.customerId, customerId),
        eq(schema.task.isActive, true)
      )
    )
    .orderBy(asc(schema.task.id))

/** The customer's row as the database holds it. */
export const customerRow = async (customerId: string) => {
  const [row] = await testDb
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
  return row!
}

/** The customer's event log, in order. */
export const logOf = (customerId: string) =>
  testDb
    .select()
    .from(schema.taskEventLog)
    .where(eq(schema.taskEventLog.customerId, customerId))
    .orderBy(asc(schema.taskEventLog.id))

/**
 * Fails with the database driver's error when the query of `run` fails:
 * Drizzle 0.45 wraps it in a DrizzleQueryError, so the SQLSTATE and the
 * driver's message are on its `cause`.
 */
export const driverFailure = (run: PromiseLike<unknown>) =>
  Promise.resolve(run).catch((error: unknown) => {
    throw driverError(error)
  })
