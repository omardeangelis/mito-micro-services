import fs from "fs"
import os from "os"
import path from "path"

/**
 * Schema the production database got from `drizzle-kit push`, which no
 * migration creates. The snapshots already include it, so `db:generate` never
 * emits it. Each piece is applied after the migration it came with, and does
 * nothing if already there.
 */
export const PUSHED_SCHEMA: { after: string | null; sql: string }[] = [
  {
    // The first migration creates the task table with this type, which the
    // third one creates only when it doesn't exist yet
    after: null,
    sql: `DO $$ BEGIN
      CREATE TYPE "public"."task_status" AS ENUM('chiamare', 'non interessato', 'app.to', 'caricato', 'richiamare', 'erogata', 'nessuno', 'followup');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
  },
  {
    // In the snapshots since this migration, in none of the SQL files
    after: "20260615235953_brown_madelyne_pryor",
    sql: `ALTER TABLE "mito-deutsche_alert" ADD COLUMN IF NOT EXISTS "is_resolved" boolean DEFAULT false NOT NULL`,
  },
]

type Journal = { entries: { tag: string }[] }

/** A copy of the migrations folder whose journal stops at entry `last`. */
function folderUpTo(folder: string, journal: Journal, last: number) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"))
  fs.mkdirSync(path.join(copy, "meta"))
  const entries = journal.entries.slice(0, last + 1)
  fs.writeFileSync(
    path.join(copy, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries })
  )
  for (const { tag } of entries) {
    fs.copyFileSync(
      path.join(folder, `${tag}.sql`),
      path.join(copy, `${tag}.sql`)
    )
  }
  return copy
}

/**
 * Builds the production schema from the migrations of `folder`, all of them
 * or up to `upTo` (a tag): Drizzle's migrator (`migrate`, one per driver)
 * applies them in order, and `exec` runs each piece of `PUSHED_SCHEMA` right
 * after the migration it came with. The migrations alone fail on an empty
 * database. On a database already migrated, only the pending ones run.
 */
export async function migrateWithPushedSchema({
  folder,
  upTo,
  migrate,
  exec,
}: {
  folder: string
  upTo?: string
  migrate: (migrationsFolder: string) => Promise<void>
  exec: (sql: string) => Promise<unknown>
}) {
  const journal = JSON.parse(
    fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")
  ) as Journal
  const indexOfTag = (tag: string) => {
    const index = journal.entries.findIndex((entry) => entry.tag === tag)
    if (index === -1) throw new Error(`Unknown migration tag: ${tag}`)
    return index
  }
  const last = upTo ? indexOfTag(upTo) : journal.entries.length - 1

  // The migrator skips the migrations already applied, and applies the
  // pending ones in one transaction
  let applied = -1
  const migrateTo = async (index: number) => {
    if (index <= applied) return
    const copy = folderUpTo(folder, journal, index)
    try {
      await migrate(copy)
    } finally {
      fs.rmSync(copy, { recursive: true })
    }
    applied = index
  }
  for (const piece of PUSHED_SCHEMA) {
    const after = piece.after ? indexOfTag(piece.after) : -1
    if (after > last) break
    await migrateTo(after)
    await exec(piece.sql)
  }
  await migrateTo(last)
}
