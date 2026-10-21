import fs from "fs"
import path from "path"
import { beforeAll, describe, expect, it } from "vitest"
import { migrateUpTo, queryReadOnly } from "@/test/db"
import { createTestDatabase, hasTestDatabase, pgClient } from "@/test/pg"
import { migrateDatabase } from "../localDb"

const journal = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../../packages/db/migrations/meta/_journal.json"
    ),
    "utf8"
  )
) as { entries: unknown[] }

// Tables, columns, indexes, constraints and enums of the public schema, in
// the same order on both: the default collations differ
const DESCRIBE_SCHEMA = [
  `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
   FROM information_schema.columns WHERE table_schema = 'public'
   ORDER BY table_name COLLATE "C", column_name COLLATE "C"`,
  `SELECT tablename, indexname, indexdef FROM pg_indexes
   WHERE schemaname = 'public' ORDER BY tablename COLLATE "C", indexname COLLATE "C"`,
  `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
   FROM pg_constraint WHERE connamespace = 'public'::regnamespace
   ORDER BY conrelid::regclass::text COLLATE "C", conname COLLATE "C"`,
  `SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   ORDER BY t.typname COLLATE "C", e.enumsortorder`,
]

describe.skipIf(!hasTestDatabase)("db:local:migrate", () => {
  beforeAll(async () => {
    await createTestDatabase()
  })

  it("su un database vuoto applica tutte le migrazioni, e un secondo lancio nessuna", async () => {
    expect(await migrateDatabase(pgClient)).toBe(journal.entries.length)
    expect(await migrateDatabase(pgClient)).toBe(0)
  })

  it("costruisce lo stesso schema dell'harness PGlite", async () => {
    await migrateDatabase(pgClient)
    await migrateUpTo()

    const local = []
    for (const sql of DESCRIBE_SCHEMA) local.push(await pgClient.unsafe(sql))
    const pglite = await queryReadOnly(DESCRIBE_SCHEMA.join(";\n"))

    expect(local[0]!.length).toBeGreaterThan(0)
    expect(local.map((rows) => [...rows])).toEqual(pglite)
  })
})
