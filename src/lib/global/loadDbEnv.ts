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
 * system operator): `.env.prod.local` with NODE_ENV=production,
 * `.env.development.local` or `.env.test.local` with development or test, and
 * none without NODE_ENV (`db:generate`, `seed:db`: only `.env`, if drizzle-kit
 * loads it, and the shell). Any other NODE_ENV stops it: a `prod` or
 * `Production` typed by hand would otherwise skip the checks below. The app
 * doesn't call it: Next.js loads its own env files, and `.env.prod.local`
 * isn't one of them, so a local `next build` or `next start` gets the
 * production database only if another env file or the shell holds it.
 *
 * With NODE_ENV=production it stops, instead of running on whatever else is
 * loaded, when `.env.prod.local` can't be read, doesn't set both database
 * keys, or `.env.production.local` is still there. Its values win over `.env`,
 * which drizzle-kit loads first, and over the shell.
 */
export function loadEnv(): void {
  // Typed as the three Next.js values, but a script can get any string
  const nodeEnv: string | undefined = process.env.NODE_ENV
  if (nodeEnv === undefined) return
  if (nodeEnv === "development" || nodeEnv === "test") {
    config({ path: `.env.${nodeEnv}.local` })
    return
  }
  if (nodeEnv !== "production") {
    throw new Error(
      `NODE_ENV is ${nodeEnv}: the database scripts take only development, test or production`
    )
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
