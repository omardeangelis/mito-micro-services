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

const journal = JSON.parse(
  fs.readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8")
) as Journal

const indexOfTag = (tag: string) => {
  const index = journal.entries.findIndex((entry) => entry.tag === tag)
  if (index === -1) throw new Error(`Unknown migration tag: ${tag}`)
  return index
}

/**
 * Schema the production database got from `drizzle-kit push`, which no
 * migration creates. The snapshots already include it, so `db:generate` never
 * emits it. Each piece is applied after the migration it came with.
 */
const PUSHED_SCHEMA: { after: string | null; sql: string }[] = [
  {
    // The first migration creates the task table with this type, which the
    // third one creates only when it doesn't exist yet
    after: null,
    sql: `CREATE TYPE "public"."task_status" AS ENUM('chiamare', 'non interessato', 'app.to', 'caricato', 'richiamare', 'erogata', 'nessuno', 'followup')`,
  },
  {
    // In the snapshots since this migration, in none of the SQL files
    after: "20260615235953_brown_madelyne_pryor",
    sql: `ALTER TABLE "mito-deutsche_alert" ADD COLUMN "is_resolved" boolean DEFAULT false NOT NULL`,
  },
]

/** A copy of the migrations folder whose journal stops at entry `last`. */
function migrationsFolderUpTo(last: number) {
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
 * Applies the repo migrations to the test database, together with the pushed
 * schema production has: all of them, or only up to `tag`. Call it once per
 * test file, in `beforeAll`.
 */
export async function migrateUpTo(tag?: string) {
  const last = tag ? indexOfTag(tag) : journal.entries.length - 1
  // Same session time zone as the Supabase database
  await testClient.exec(`SET TIME ZONE 'UTC'`)

  // The migrator skips the migrations already applied
  let applied = -1
  const migrateTo = async (index: number) => {
    if (index <= applied) return
    await migrate(testDb, { migrationsFolder: migrationsFolderUpTo(index) })
    applied = index
  }
  for (const piece of PUSHED_SCHEMA) {
    const after = piece.after ? indexOfTag(piece.after) : -1
    if (after > last) break
    await migrateTo(after)
    await testClient.exec(piece.sql)
  }
  await migrateTo(last)
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
