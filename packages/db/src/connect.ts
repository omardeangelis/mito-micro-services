import postgres from "postgres"

/**
 * A postgres.js client on the app's database: `SUPABASE_DB_CONNECTION_STRING`
 * with the password `SUPABASE_MITO_PSW`. `options` add to those, like `max`.
 *
 * On Cloud Run the database is Cloud SQL, through the Unix socket Cloud Run
 * mounts in the directory INSTANCE_UNIX_SOCKET (/cloudsql/<instance>). As a
 * path: the instance name has colons, which postgres.js reads as ports in a host
 */
export function connect(options: postgres.Options<Record<string, never>> = {}) {
  const socket = process.env.INSTANCE_UNIX_SOCKET
  return postgres(process.env.SUPABASE_DB_CONNECTION_STRING!, {
    password: process.env.SUPABASE_MITO_PSW!,
    prepare: false,
    ...(socket ? { path: `${socket}/.s.PGSQL.5432` } : {}),
    ...options,
  })
}
