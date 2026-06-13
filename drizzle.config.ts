/* eslint-disable prettier/prettier */
import {  defineConfig } from "drizzle-kit"
import { loadEnv } from "@/lib/global/env"

loadEnv()

// export default {
//   schema: "./src/server/db/schema/*",
//   driver: "pg",
//   dbCredentials: {
//     connectionString: env.SUPABASE_DB_CONNECTION_STRING,
//   },
//   out: "./src/server/db/migrations",
// } satisfies Config

export default defineConfig({
  schema: "./src/server/db/schema/*",
  dialect: "postgresql",
  migrations: {
    prefix: "supabase"
  },
  dbCredentials: {
    // expect ts error here
    url: process.env.SUPABASE_DB_CONNECTION_STRING!,
    password: process.env.SUPABASE_MITO_PSW!,
  },
  out: "./src/server/db/migrations",
})