import fs from "fs"
import path from "path"
import { Data, Effect } from "effect"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type postgres from "postgres"

/** The migrations could not be read or applied: none of the pending ones is. */
export class MigrationError extends Data.TaggedError("MigrationError")<{
  cause: unknown
}> {}

/**
 * Migrations never applied, dated between ones already applied: Drizzle's
 * migrator applies only those newer than the last one applied, so it would
 * skip them and report success. It happens when a branch merges a migration
 * generated before one already deployed (`pnpm db:check` catches it on the PR).
 */
export class MigrationOutOfOrder extends Data.TaggedError(
  "MigrationOutOfOrder"
)<{ tags: string[] }> {}

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new MigrationError({ cause }),
  })

/** The rows of `drizzle.__drizzle_migrations`: one per migration applied. */
const appliedMigrations = (client: postgres.Sql) =>
  attempt(async () => {
    const [table] = await client<{ exists: boolean }[]>`
      SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`
    if (!table!.exists) return 0
    const [row] = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
    return row!.n
  })

/** The `created_at` of the rows of `drizzle.__drizzle_migrations`. */
const appliedDates = (client: postgres.Sql) =>
  attempt(async () => {
    const [table] = await client<{ exists: boolean }[]>`
      SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`
    if (!table!.exists) return []
    const rows = await client<{ created_at: string }[]>`
      SELECT created_at FROM drizzle.__drizzle_migrations`
    return rows.map((row) => Number(row.created_at))
  })

/**
 * Fails with `MigrationOutOfOrder` when a migration of `folder` was never
 * applied but is older than the last one applied. Only between the first and
 * the last applied: what predates the first is the schema the database had
 * before its migrations were tracked.
 */
const checkOrder = (client: postgres.Sql, folder: string) =>
  Effect.gen(function* () {
    const applied = yield* appliedDates(client)
    if (applied.length === 0) return
    const first = Math.min(...applied)
    const last = Math.max(...applied)
    const { entries } = yield* attempt(
      async () =>
        JSON.parse(
          fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")
        ) as { entries: { when: number; tag: string }[] }
    )
    const tags = entries
      .filter(
        ({ when }) => when > first && when < last && !applied.includes(when)
      )
      .map(({ tag }) => tag)
    if (tags.length > 0) return yield* new MigrationOutOfOrder({ tags })
  })

/**
 * Applies the migrations of `folder` still pending on the database of
 * `client`, as `drizzle-kit migrate` (`db:migrate`) does, and returns how many
 * it applied. Drizzle's migrator applies them in one transaction: when one
 * fails, none is applied. The database must already have the schema
 * production got from `db:push` (`pushedSchema.ts`), as staging and
 * production do. Fails with `MigrationOutOfOrder`, applying nothing, when
 * the migrator would skip a pending migration.
 */
export const applyMigrations = (client: postgres.Sql, folder: string) =>
  Effect.gen(function* () {
    yield* checkOrder(client, folder)
    const before = yield* appliedMigrations(client)
    yield* attempt(() => migrate(drizzle(client), { migrationsFolder: folder }))
    return (yield* appliedMigrations(client)) - before
  })
