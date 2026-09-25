import { vi } from "vitest"

// Boundaries of the server code under test. The factories are lazy: a test
// file that never imports these modules never starts the in-memory database.

// Middlewares, cron routes and services import `db` from the module, not from
// the tRPC context
vi.mock("@/server/db", async () => ({
  db: (await import("@/test/db")).testDb,
}))

// Sessions come from `createTestCaller`
vi.mock("@/server/auth", () => ({
  authOptions: {},
  getServerAuthSession: vi.fn(async () => null),
}))

// Created on import from env vars the tests don't have
vi.mock("@/server/client/supabase", () => ({ supabaseClient: {} }))
