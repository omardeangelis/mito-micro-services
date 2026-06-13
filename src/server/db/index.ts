import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index"
import postgres from "postgres"
import { loadEnv } from "@/lib/global/env"

loadEnv()
const connection = postgres(
  process.env.PREVIEW_DB ?? process.env.SUPABASE_DB_CONNECTION_STRING!,
  {
    password: process.env.PREVIEW_DB_PSW ?? process.env.SUPABASE_MITO_PSW!,
    prepare: false,
  }
)

export const db = drizzle(connection, { schema })
