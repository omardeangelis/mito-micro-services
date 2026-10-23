import fs from "fs"
import os from "os"
import path from "path"
import { beforeAll, describe, expect, it } from "vitest"
import { Effect, Exit } from "effect"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"
import { failureTag } from "@/test/effect"
import { applyMigrations, MigrationOutOfOrder } from "../migrate"

// The job that runs before each deploy of the backend (apps/api/src/migrate.ts),
// on a database migrated up to the migration before the last one, as staging
// is when a merge brings a new migration

const FOLDER = path.resolve(__dirname, "../../migrations")
const journal = JSON.parse(
  fs.readFileSync(path.join(FOLDER, "meta/_journal.json"), "utf8")
) as { entries: { idx: number; when: number; tag: string }[] }
const [beforeLast, last] = journal.entries.slice(-2)

const appliedCount = () =>
  pgClient<{ n: number }[]>`
    SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`.then(
    ([row]) => row!.n
  )

/** A copy of the migrations with one more, whose SQL fails. */
function folderWithFailingMigration() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"))
  fs.cpSync(FOLDER, copy, { recursive: true })
  const tag = "99999999999999_fails"
  fs.writeFileSync(
    path.join(copy, `${tag}.sql`),
    "SELECT * FROM no_such_table;"
  )
  const entries = [
    ...journal.entries,
    { ...last!, idx: last!.idx + 1, when: last!.when + 1, tag },
  ]
  fs.writeFileSync(
    path.join(copy, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries })
  )
  return copy
}

/**
 * A copy of the migrations with one more, never applied, dated just before
 * the last one: a branch that merged a migration generated before it.
 */
function folderWithOlderMigration() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"))
  fs.cpSync(FOLDER, copy, { recursive: true })
  const tag = "20261021000000_older"
  fs.writeFileSync(path.join(copy, `${tag}.sql`), "SELECT 1;")
  const entries = [
    ...journal.entries.slice(0, -1),
    { ...last!, when: last!.when - 1, tag },
    { ...last!, idx: last!.idx + 1 },
  ]
  fs.writeFileSync(
    path.join(copy, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries })
  )
  return { copy, tag }
}

describe.skipIf(!hasTestDatabase)("applyMigrations", () => {
  beforeAll(async () => {
    await migrateUpTo(beforeLast!.tag)
  })

  it("applies none of the pending migrations when one fails", async () => {
    const before = await appliedCount()

    const exit = await Effect.runPromiseExit(
      applyMigrations(pgClient, folderWithFailingMigration())
    )

    expect(failureTag(exit)).toBe("MigrationError")
    expect(await appliedCount()).toBe(before)
  })

  it("fails when the folder has no migrations", async () => {
    const exit = await Effect.runPromiseExit(
      applyMigrations(pgClient, path.join(os.tmpdir(), "no-migrations-here"))
    )

    expect(failureTag(exit)).toBe("MigrationError")
  })

  it("applies the pending migrations and returns how many", async () => {
    const before = await appliedCount()

    const exit = await Effect.runPromiseExit(applyMigrations(pgClient, FOLDER))

    expect(exit).toStrictEqual(Exit.succeed(1))
    expect(await appliedCount()).toBe(before + 1)
  })

  it("applies nothing on a database already migrated", async () => {
    const exit = await Effect.runPromiseExit(applyMigrations(pgClient, FOLDER))

    expect(exit).toStrictEqual(Exit.succeed(0))
  })

  it("fails on a pending migration older than the last one applied", async () => {
    const before = await appliedCount()
    const { copy, tag } = folderWithOlderMigration()

    const exit = await Effect.runPromiseExit(applyMigrations(pgClient, copy))

    expect(exit).toStrictEqual(
      Exit.fail(new MigrationOutOfOrder({ tags: [tag] }))
    )
    expect(await appliedCount()).toBe(before)
  })
})
