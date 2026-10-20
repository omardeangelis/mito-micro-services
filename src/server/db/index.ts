import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index"
import postgres from "postgres"

// On Cloud Run the database is Cloud SQL, through the Unix socket Cloud Run
// mounts in the directory INSTANCE_UNIX_SOCKET (/cloudsql/<instance>). As a
// path: the instance name has colons, which postgres.js reads as ports in a host
const socket = process.env.INSTANCE_UNIX_SOCKET

const connection = postgres(process.env.SUPABASE_DB_CONNECTION_STRING!, {
  password: process.env.SUPABASE_MITO_PSW!,
  prepare: false,
  ...(socket ? { path: `${socket}/.s.PGSQL.5432` } : {}),
})

export const db = drizzle(connection, { schema })
