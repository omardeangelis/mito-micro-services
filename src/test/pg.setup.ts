import { afterAll, vi } from "vitest"

// The `*.pg.test.ts` files run after src/test/setup.ts and keep its
// boundaries; only `@/server/db` changes, to the pool on a real Postgres
// (src/test/pg.ts)

// In CI they run, never skipped: without the database the job fails
if (process.env.CI && !process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set: in CI the Postgres tests run")
}

vi.mock("@/server/db", async () => ({
  db: (await import("@/test/pg")).pgDb,
}))

afterAll(async () => {
  const { dropTestDatabase } = await import("@/test/pg")
  await dropTestDatabase()
})
