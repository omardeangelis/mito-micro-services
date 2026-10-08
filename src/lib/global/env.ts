import { config } from "dotenv"

/**
 * Loads the env file of the database scripts (drizzle-kit, the seeds, the
 * system operator): `.env.prod.local` with NODE_ENV=production, otherwise
 * `.env.<NODE_ENV>.local`. The app doesn't call it: Next.js loads its own env
 * files, and `.env.prod.local` isn't one of them, so a local `next build` or
 * `next start` never gets the production credentials.
 */
export function loadEnv(): void {
  config({
    path:
      process.env.NODE_ENV === "production"
        ? ".env.prod.local"
        : `.env.${process.env.NODE_ENV}.local`,
  })
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV === "development",
  isTest: process.env.NODE_ENV === "test",
}
