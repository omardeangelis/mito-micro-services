import { createHash } from "crypto"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { localConnection } from "@mito/db/localDsn"
import { migrateWithPushedSchema } from "@mito/db/pushedSchema"
import * as schema from "@mito/db/schema/index"
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"

/**
 * The local database, in the Postgres of docker-compose.yml. Written here: the
 * `db:local:*` scripts read no env file, no Supabase variable and never
 * `loadEnv`, so they can't reach the development or the production database.
 */
export const LOCAL_DATABASE_URL =
  "postgres://postgres:local@127.0.0.1:54329/mito_local"

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../../../packages/db/migrations", import.meta.url)
)

const connect = (database: string) =>
  postgres({
    // Stops before connecting unless the host is local and the database is
    // mito_local
    ...localConnection(LOCAL_DATABASE_URL, { database: "mito_local" }),
    database,
    max: 1,
    onnotice: () => undefined,
  })

/**
 * The options of the local seed's connection to mito_local, from `dsn`, or an
 * error before anything connects: the host must be `localhost` or
 * `127.0.0.1`, the database `mito_local`, and the DSN without a query string
 * (`localConnection`). Pass them to `postgres()` as options, never the DSN:
 * `PGHOST`, `PGDATABASE`, `PGPORT` and the Supabase variables then can't
 * change where it connects.
 */
export function localSeedConnection(dsn: string = LOCAL_DATABASE_URL) {
  return localConnection(dsn, { database: "mito_local" })
}

/**
 * The client of the `seed:local*` commands on mito_local, and its pool to
 * close. No env file and no session time zone: mito_local has
 * `Europe/Rome` at database level (`resetLocalDatabase`). It connects on the
 * first query.
 */
export function connectLocal() {
  const client = postgres({
    ...localSeedConnection(),
    max: 2,
    onnotice: () => undefined,
  })
  return { client, db: drizzle(client, { schema }) }
}

const appliedMigrations = async (client: postgres.Sql) => {
  const [table] = await client<{ exists: boolean }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`
  if (!table!.exists) return 0
  const [row] = await client<{ n: number }[]>`
    SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`
  return row!.n
}

/**
 * Applies the repo migrations still pending on the database of `client`, with
 * the pieces production got from `db:push` (`migrateWithPushedSchema`), and
 * returns how many it applied: on an empty database all of them, on one
 * already migrated only the new ones, as `db:migrate`.
 */
export async function migrateDatabase(client: postgres.Sql) {
  const before = await appliedMigrations(client)
  await migrateWithPushedSchema({
    folder: MIGRATIONS_FOLDER,
    migrate: (migrationsFolder) =>
      migrate(drizzle(client), { migrationsFolder }),
    exec: (sql) => client.unsafe(sql),
  })
  return (await appliedMigrations(client)) - before
}

/** The repo's migrations as Drizzle's `readMigrationFiles` reads them. */
function repoMigrations(folder: string) {
  const journal = JSON.parse(
    fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] }
  return journal.entries.map(({ tag, when }) => {
    // As `readMigrationFiles`: the file as a string, hashed as UTF-8
    const query = fs.readFileSync(`${folder}/${tag}.sql`).toString()
    return {
      tag,
      createdAt: String(when),
      hash: createHash("sha256").update(query).digest("hex"),
    }
  })
}

/**
 * What differs between the repo's migrations and the rows of
 * `drizzle.__drizzle_migrations` on the database of `client`, one Italian line
 * per problem: a migration not applied, a row no migration of the repo has, a
 * row whose `hash` or `created_at` isn't the migration's. Drizzle's migrator
 * writes one row per migration, in the journal's order, with the SHA-256 of
 * its SQL file and its `when`. Empty when the database has all of them and
 * nothing else.
 */
export async function pendingMigrations(
  client: DbClient,
  folder: string = MIGRATIONS_FOLDER
): Promise<string[]> {
  const repo = repoMigrations(folder)
  const [table] = await client.execute<{ exists: boolean }>(
    sql`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`
  )
  // `created_at` is a bigint: as text, compared with the journal's `when`
  const rows = table?.exists
    ? await client.execute<{ hash: string; created_at: string | null }>(
        sql`SELECT hash, created_at::text AS created_at
            FROM drizzle.__drizzle_migrations ORDER BY id`
      )
    : []

  const problems: string[] = []
  for (let i = 0; i < Math.max(repo.length, rows.length); i++) {
    const migration = repo[i]
    const row = rows[i]
    if (!row) {
      problems.push(`la migrazione ${migration!.tag} non è applicata`)
    } else if (!migration) {
      problems.push(
        `drizzle.__drizzle_migrations ha una riga in più (created_at ` +
          `${row.created_at}) che nessuna migrazione del repo spiega`
      )
    } else if (row.created_at !== migration.createdAt) {
      problems.push(
        `la migrazione ${migration.tag} ha created_at ${row.created_at} ` +
          `invece di ${migration.createdAt}`
      )
    } else if (row.hash !== migration.hash) {
      problems.push(
        `la migrazione ${migration.tag} è registrata con un hash diverso ` +
          `da quello del suo file SQL`
      )
    }
  }
  return problems
}

/** `db:local:migrate`: the pending migrations on mito_local. */
export async function migrateLocalDatabase() {
  const client = connect("mito_local")
  try {
    return await migrateDatabase(client)
  } finally {
    await client.end()
  }
}

/**
 * `db:local:reset`: drops mito_local and creates it again, empty, in the time
 * zone of the databases in use.
 */
export async function resetLocalDatabase() {
  // From the server's own database: mito_local can't drop itself
  const server = connect("postgres")
  try {
    await server`DROP DATABASE IF EXISTS mito_local WITH (FORCE)`
    await server`CREATE DATABASE mito_local`
    // As the development and production databases: the sessions' dates
    await server`ALTER DATABASE mito_local SET TimeZone = 'Europe/Rome'`
  } finally {
    await server.end()
  }
}
