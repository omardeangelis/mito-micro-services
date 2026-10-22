import { Data, Effect } from "effect"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import type postgres from "postgres"

/** The migrations could not be read or applied: none of the pending ones is. */
export class MigrationError extends Data.TaggedError("MigrationError")<{
  cause: unknown
}> {}

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

/**
 * Applies the migrations of `folder` still pending on the database of
 * `client`, as `drizzle-kit migrate` (`db:migrate`) does, and returns how many
 * it applied. Drizzle's migrator applies them in one transaction: when one
 * fails, none is applied. The database must already have the schema
 * production got from `db:push` (`pushedSchema.ts`), as staging and
 * production do.
 */
export const applyMigrations = (client: postgres.Sql, folder: string) =>
  Effect.gen(function* () {
    const before = yield* appliedMigrations(client)
    yield* attempt(() => migrate(drizzle(client), { migrationsFolder: folder }))
    return (yield* appliedMigrations(client)) - before
  })
