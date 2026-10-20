import { randomBytes } from "crypto"
import path from "path"
import postgres from "postgres"
import { and, asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { localConnection } from "@/server/db/localDsn"
import { migrateWithPushedSchema } from "@/server/db/pushedSchema"
import * as schema from "@/server/db/schema/index"

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../server/db/migrations")

const dsn = process.env.TEST_DATABASE_URL

/**
 * Whether the `*.pg.test.ts` files run. Without `TEST_DATABASE_URL` they are
 * skipped (`describe.skipIf(!hasTestDatabase)`), except in CI, where
 * `pg.setup.ts` fails them.
 */
export const hasTestDatabase = Boolean(dsn)

// A DSN that isn't local stops here, before anything connects
const server = dsn ? localConnection(dsn) : undefined

/**
 * The database of this test file: created by `migrateUpTo` on the server of
 * `TEST_DATABASE_URL`, dropped after the file (`pg.setup.ts`). The tests never
 * work on the DSN's own database, so their `TRUNCATE` can't reach one with
 * data, such as `mito_local`.
 */
export const testDatabaseName = `mito_test_${randomBytes(6).toString("hex")}`

const connect = (database: string, max: number) =>
  postgres({
    ...server!,
    database,
    max,
    onnotice: () => undefined,
    // As the PGlite harness: DATE() of a timestamptz depends on it
    connection: { TimeZone: "UTC" },
  })

/** Stands in for the pool and its Drizzle client when there is no database. */
const unset = <T>() =>
  new Proxy(
    {},
    {
      get() {
        throw new Error("TEST_DATABASE_URL is not set")
      },
    }
  ) as T

/**
 * A pool on the test database, standing in for `@/server/db` in
 * `*.pg.test.ts` files: calls made together take different connections, as in
 * production. It connects on the first query.
 */
export const pgClient = server
  ? connect(testDatabaseName, 10)
  : unset<ReturnType<typeof postgres>>()
export const pgDb = server
  ? drizzle(pgClient, { schema })
  : unset<ReturnType<typeof drizzle<typeof schema>>>()

let created = false

/** Runs `run` on the DSN's own database, to create or drop the test one. */
async function onServer(run: (sql: postgres.Sql) => Promise<unknown>) {
  const sql = connect(server!.database, 1)
  try {
    await run(sql)
  } finally {
    await sql.end()
  }
}

/** Creates the test database, empty, once. `migrateUpTo` calls it. */
export async function createTestDatabase() {
  if (created) return
  await onServer((sql) => sql`CREATE DATABASE ${sql(testDatabaseName)}`)
  created = true
}

/**
 * Creates the test database and applies the repo migrations with the pushed
 * schema production has, as `migrateUpTo` of `@/test/db`: all of them, or
 * only up to `tag`. Call it in `beforeAll`.
 */
export async function migrateUpTo(tag?: string) {
  await createTestDatabase()
  await migrateWithPushedSchema({
    folder: MIGRATIONS_FOLDER,
    upTo: tag,
    migrate: (migrationsFolder) => migrate(pgDb, { migrationsFolder }),
    exec: (sql) => pgClient.unsafe(sql),
  })
}

/** Closes the pool and drops the test database, if it was created. */
export async function dropTestDatabase() {
  if (!created) return
  // A test that failed may leave a connection busy: close them all
  await pgClient.end({ timeout: 1 })
  await onServer(
    (sql) => sql`DROP DATABASE IF EXISTS ${sql(testDatabaseName)} WITH (FORCE)`
  )
  created = false
}

/** Empties every table of the `public` schema. */
export async function resetDb() {
  const tables = await pgClient<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  if (tables.length === 0) return
  await pgClient.unsafe(
    `TRUNCATE ${tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ")} RESTART IDENTITY CASCADE`
  )
}

/** The customer's active tasks, oldest first. */
export const activeTasksOf = (customerId: string) =>
  pgDb
    .select()
    .from(schema.task)
    .where(
      and(
        eq(schema.task.customerId, customerId),
        eq(schema.task.isActive, true)
      )
    )
    .orderBy(asc(schema.task.id))

/**
 * Locks the customer's row from a transaction of the test, on a connection of
 * its own, as `lockCustomer` does: a call that locks the same customer waits
 * until `release`. `db` writes inside that transaction, as a colleague's call
 * holding the lock would.
 */
export async function holdCustomerLock(customerId: string) {
  // One connection: postgres.js then takes a BEGIN outside `begin`
  const client = connect(testDatabaseName, 1)
  const db = drizzle(client, { schema })
  try {
    await client`BEGIN`
    const [customer] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId))
      .for("update")
    if (!customer) throw new Error(`No customer ${customerId} to lock`)
  } catch (error) {
    await client.end()
    throw error
  }
  return {
    db,
    /** Commits the test's transaction, which frees the lock. */
    release: async () => {
      await client`COMMIT`
      await client.end()
    },
  }
}

/**
 * Waits until `n` backends of the test database wait for a lock, so the calls
 * a test started are queued behind `holdCustomerLock`. Fails after `timeoutMs`.
 */
export async function waitUntilBlocked(n: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const [row] = await pgClient<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`
    if (row!.waiting >= n) return
    if (Date.now() > deadline) {
      throw new Error(
        `${row!.waiting} of ${n} backends waiting for a lock after ${timeoutMs} ms`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
