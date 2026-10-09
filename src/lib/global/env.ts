import { existsSync } from "fs"
import { config } from "dotenv"

/**
 * Loads the env file of the database scripts (drizzle-kit, the seeds, the
 * system operator): `.env.prod.local` with NODE_ENV=production, otherwise
 * `.env.<NODE_ENV>.local`. The app doesn't call it: Next.js loads its own env
 * files, and `.env.prod.local` isn't one of them, so a local `next build` or
 * `next start` never gets the production credentials.
 *
 * With NODE_ENV=production it stops, instead of running on whatever else is
 * loaded, when `.env.prod.local` can't be read or `.env.production.local` is
 * still there. Its values win over `.env`, which drizzle-kit loads first, and
 * over the shell.
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
  const { error } = config({ path: ".env.prod.local", override: true })
  if (error) {
    throw new Error(`Cannot read .env.prod.local: ${error.message}`)
  }
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV === "development",
  isTest: process.env.NODE_ENV === "test",
}
