import { vi } from "vitest"
import type * as ErrorReporterModule from "@/server/effect/errorReporter"

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

// Sentry: failures reported with `ErrorReporter` land in `reportedErrors`
// (src/test/errorReporter.ts) instead
vi.mock("@/server/effect/errorReporter", async (importOriginal) => {
  const original = await importOriginal<typeof ErrorReporterModule>()
  const { Effect, Layer } = await import("effect")
  const { reportedErrors } = await import("@/test/errorReporter")
  return {
    ...original,
    SentryReporterLive: Layer.succeed(original.ErrorReporter, {
      report: (cause, data) =>
        Effect.sync(() => {
          reportedErrors.push({ cause, data })
        }),
    }),
  }
})
