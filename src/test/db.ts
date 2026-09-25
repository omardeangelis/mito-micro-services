import fs from "fs"
import os from "os"
import path from "path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import * as schema from "@/server/db/schema/index"

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../server/db/migrations")

/**
 * Last migration before the unique index on active contacts (PR2). Tests that
 * seed dirty data (more than one active task per customer) migrate up to here,
 * so they keep working once that index exists.
 */
export const LEGACY_SCHEMA_TAG = "20260902181440_nebulous_susan_delgado"

/** In-memory Postgres standing in for `@/server/db` in `*.db.test.ts` files. */
export const testClient = new PGlite()
export const testDb = drizzle(testClient, { schema })

type Journal = { entries: { tag: string }[] }

function migrationsUpTo(tag: string) {
  const journal = JSON.parse(
    fs.readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")
  ) as Journal
  const last = journal.entries.findIndex((entry) => entry.tag === tag)
  if (last === -1) throw new Error(`Unknown migration tag: ${tag}`)

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"))
  fs.mkdirSync(path.join(folder, "meta"))
  const entries = journal.entries.slice(0, last + 1)
  fs.writeFileSync(
    path.join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries })
  )
  for (const { tag } of entries) {
    fs.copyFileSync(
      path.join(MIGRATIONS_FOLDER, `${tag}.sql`),
      path.join(folder, `${tag}.sql`)
    )
  }
  return folder
}

/**
 * Applies the repo migrations to the test database: all of them, or only up to
 * `tag`. Call it once per test file, in `beforeAll`.
 */
export async function migrateUpTo(tag?: string) {
  // Same session time zone as the Supabase database
  await testClient.exec(`SET TIME ZONE 'UTC'`)
  // The first migration creates the task table with the `task_status` type,
  // which the third migration creates. The production database already had
  // the type (it was pushed before migrations existed); the third migration
  // skips it when it exists.
  await testClient.exec(`
    CREATE TYPE "public"."task_status" AS ENUM('chiamare', 'non interessato', 'app.to', 'caricato', 'richiamare', 'erogata', 'nessuno', 'followup');
  `)
  await migrate(testDb, {
    migrationsFolder: tag ? migrationsUpTo(tag) : MIGRATIONS_FOLDER,
  })
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
