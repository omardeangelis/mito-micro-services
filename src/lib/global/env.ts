import { existsSync } from "fs"
import { config } from "dotenv"

// The production database: the production scripts take it only from
// .env.prod.local
const PRODUCTION_DB_KEYS = [
  "SUPABASE_DB_CONNECTION_STRING",
  "SUPABASE_MITO_PSW",
] as const

/**
 * Loads the env file of the database scripts (drizzle-kit, the seeds, the
 * system operator): `.env.prod.local` with NODE_ENV=production, otherwise
 * `.env.<NODE_ENV>.local`. The app doesn't call it: Next.js loads its own env
 * files, and `.env.prod.local` isn't one of them, so a local `next build` or
 * `next start` gets the production database only if another env file or the
 * shell holds it.
 *
 * With NODE_ENV=production it stops, instead of running on whatever else is
 * loaded, when `.env.prod.local` can't be read, doesn't set both database
 * keys, or `.env.production.local` is still there. Its values win over `.env`,
 * which drizzle-kit loads first, and over the shell.
 */
export function loadEnv(): void {
  if (process.env.NODE_ENV !== "production") {
    config({ path: `.env.${process.env.NODE_ENV}.local` })
    return
  }
  if (existsSync(".env.production.local")) {
    throw new Error(
      "Rename .env.production.local to .env.prod.local: Next.js loads .env.production.local in every local build"
    )
  }
  const { parsed, error } = config({ path: ".env.prod.local", override: true })
  if (error) {
    throw new Error(`Cannot read .env.prod.local: ${error.message}`)
  }
  const missing = PRODUCTION_DB_KEYS.filter((key) => !parsed?.[key]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `.env.prod.local doesn't set ${missing.join(" and ")}: the production scripts take the database only from this file`
    )
  }
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV === "development",
  isTest: process.env.NODE_ENV === "test",
}
