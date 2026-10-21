import { fileURLToPath } from "url"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { localConnection } from "@mito/db/localDsn"
import { migrateWithPushedSchema } from "@mito/db/pushedSchema"

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
