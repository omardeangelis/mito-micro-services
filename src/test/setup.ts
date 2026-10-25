import { afterEach, beforeEach, vi } from "vitest"
import type * as ErrorReporterModule from "@mito/server/effect/errorReporter"

// Boundaries of the server code under test. The factories are lazy: a test
// file that never imports these modules never starts the in-memory database.

// Middlewares, cron routes and services import `db` from the module, not from
// the tRPC context
vi.mock("@mito/db", async () => ({
  db: (await import("@/test/db")).testDb,
}))

// Sessions come from `createTestCaller`
vi.mock("@mito/server/auth", () => ({
  authOptions: {},
  getServerAuthSession: vi.fn(async () => null),
}))

// Sentry: failures reported with `ErrorReporter` land in `reportedErrors`
// (src/test/errorReporter.ts) instead
vi.mock("@mito/server/effect/errorReporter", async (importOriginal) => {
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

beforeEach(async () => {
  const { reportedErrors } = await import("@/test/errorReporter")
  reportedErrors.length = 0
})

// Component tests (jsdom only: this file also runs in the node environment of
// `*.db.test.ts`)
if (typeof window !== "undefined") {
  // jsdom lacks what Radix reads on pointer and menu interactions
  const polyfills = {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  }
  for (const [name, polyfill] of Object.entries(polyfills)) {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, {
        value: polyfill,
        configurable: true,
        writable: true,
      })
    }
  }
  if (!Reflect.has(window, "ResizeObserver")) {
    window.ResizeObserver = class ResizeObserver {
      observe = () => undefined
      unobserve = () => undefined
      disconnect = () => undefined
    }
  }

  // Testing Library only cleans up by itself when `afterEach` is a global,
  // and vitest runs here without globals
  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react")
    cleanup()
  })
}
