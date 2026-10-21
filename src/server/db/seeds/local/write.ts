// Writes a `Dataset` to the local database: one transaction that empties every
// table of `public` and inserts the rows in FK order, with their explicit ids.
// Not an Effect program: it is a script helper that runs only on a local
// database, and a failure must simply roll everything back.
import { getTableColumns, getTableName, sql, type Table } from "drizzle-orm"
import { driverError } from "@mito/db/driverError"
import {
  alert,
  chat,
  customers,
  customerToPratica,
  messages,
  operators,
  practices,
  products,
  task,
  taskEventLog,
  users,
} from "@mito/db/schema/index"
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import type { Dataset } from "./types"

/** Postgres rejects a statement with more bind parameters than this. */
const MAX_BIND_PARAMETERS = 65_535

/** Default wait for a table lock before giving up. */
const DEFAULT_LOCK_TIMEOUT_MS = 10_000

/** SQLSTATE `lock_not_available`: raised when `lock_timeout` expires. */
const LOCK_NOT_AVAILABLE = "55P03"

/** The only databases the seed may empty, besides the `mito_test_` ones. */
const LOCAL_DATABASE = "mito_local"
const TEST_DATABASE_PREFIX = "mito_test_"

/** Tables whose `id` is an identity column: their sequence is realigned. */
const IDENTITY_TABLES = [
  products,
  operators,
  chat,
  messages,
  practices,
  alert,
  task,
  taskEventLog,
] as const

/** Rows per INSERT that keep a statement under the bind parameter limit. */
function chunkSize(table: Table) {
  return Math.floor(
    MAX_BIND_PARAMETERS / Object.keys(getTableColumns(table)).length
  )
}

function* chunks<T>(rows: readonly T[], size: number) {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size)
}

const quote = (name: string) => `"public"."${name.replaceAll('"', '""')}"`

function assertLocalDatabase(name: unknown) {
  if (
    typeof name === "string" &&
    (name === LOCAL_DATABASE || name.startsWith(TEST_DATABASE_PREFIX))
  ) {
    return
  }
  throw new Error(
    `Il seed locale svuota tutte le tabelle e gira solo su "${LOCAL_DATABASE}" ` +
      `(o su un database "${TEST_DATABASE_PREFIX}*"), ma il database ` +
      `collegato e' "${String(name)}": non ho toccato nulla`
  )
}

export async function writeDataset(
  client: DbClient,
  dataset: Dataset,
  options: { lockTimeoutMs?: number } = {}
): Promise<void> {
  const lockTimeoutMs = Math.max(
    1,
    Math.trunc(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS)
  )

  // Before anything else, outside the transaction: nothing is emptied on a
  // database that is not a local one
  const [current] = await client.execute<{ current_database: string }>(
    sql`SELECT current_database()`
  )
  assertLocalDatabase(current?.current_database)

  try {
    await client.transaction(async (tx) => {
      // Applies to this transaction only: another session holding a lock
      // (`db:studio`, psql) makes the TRUNCATE fail instead of hang
      await tx.execute(
        sql`SELECT set_config('lock_timeout', ${String(lockTimeoutMs)}, true)`
      )

      const tables = await tx.execute<{ tablename: string }>(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
      )
      if (tables.length > 0) {
        await tx.execute(
          sql.raw(
            `TRUNCATE ${tables.map((t) => quote(t.tablename)).join(", ")} ` +
              `RESTART IDENTITY CASCADE`
          )
        )
      }

      // The identity ids are GENERATED ALWAYS: the explicit ones need the
      // override. Every insert is chunked under the bind parameter limit
      for (const rows of chunks(dataset.products, chunkSize(products))) {
        await tx.insert(products).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(dataset.users, chunkSize(users))) {
        await tx.insert(users).values(rows)
      }
      for (const rows of chunks(dataset.operators, chunkSize(operators))) {
        await tx.insert(operators).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(dataset.chats, chunkSize(chat))) {
        await tx.insert(chat).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(dataset.messages, chunkSize(messages))) {
        await tx.insert(messages).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(dataset.customers, chunkSize(customers))) {
        await tx.insert(customers).values(rows)
      }
      for (const rows of chunks(dataset.practices, chunkSize(practices))) {
        await tx.insert(practices).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(
        dataset.customerToPratica,
        chunkSize(customerToPratica)
      )) {
        await tx.insert(customerToPratica).values(rows)
      }
      for (const rows of chunks(dataset.alerts, chunkSize(alert))) {
        await tx.insert(alert).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(dataset.tasks, chunkSize(task))) {
        await tx.insert(task).overridingSystemValue().values(rows)
      }
      for (const rows of chunks(
        dataset.taskEventLog,
        chunkSize(taskEventLog)
      )) {
        await tx.insert(taskEventLog).overridingSystemValue().values(rows)
      }

      // The explicit ids did not advance the sequences: a later insert
      // without id must get one above the dataset's
      for (const table of IDENTITY_TABLES) {
        const name = quote(getTableName(table))
        await tx.execute(
          sql.raw(
            `SELECT setval(pg_get_serial_sequence('${name}', 'id'), max(id)) ` +
              `FROM ${name} HAVING count(*) > 0`
          )
        )
      }
    })
  } catch (error) {
    const cause = driverError(error)
    if ((cause as { code?: unknown } | null)?.code === LOCK_NOT_AVAILABLE) {
      throw new Error(
        `Un'altra sessione (db:studio, psql, un'app collegata) tiene un lock ` +
          `sulle tabelle del database e dopo ${lockTimeoutMs} ms non si e' ` +
          `liberato: chiudila e rilancia il seed. Non ho modificato nulla`,
        { cause }
      )
    }
    throw error
  }
}
