// @vitest-environment node
import * as Sentry from "@sentry/node"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Cause, Effect } from "effect"
import {
  ErrorReporter,
  SentryReporterLive,
} from "@mito/server/effect/errorReporter"

// The real layer: src/test/setup.ts replaces it in every test with one that
// only pushes into `reportedErrors`
vi.unmock("@mito/server/effect/errorReporter")

// The envelope the SDK hands its transport, typed by the SDK itself
type Transport = ReturnType<NonNullable<Sentry.NodeOptions["transport"]>>
type Envelope = Parameters<Transport["send"]>[0]

const envelopes: Envelope[] = []

beforeEach(() => {
  envelopes.length = 0
  Sentry.init({
    dsn: "https://public@sentry.invalid/1",
    defaultIntegrations: false,
    registerEsmLoaderHooks: false,
    // Keeps the envelopes in memory instead of sending them
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope)
        return {}
      },
      flush: async () => true,
    }),
  })
})

afterEach(async () => {
  await Sentry.close()
})

describe("SentryReporterLive", () => {
  it("manda a Sentry l'errore della causa, con i dati del caso", async () => {
    await Effect.runPromise(
      Effect.flatMap(ErrorReporter, (reporter) =>
        reporter.report(Cause.fail(new Error("boom")), { alertId: 7 })
      ).pipe(Effect.provide(SentryReporterLive))
    )
    await Sentry.flush(2000)

    // Every item of every envelope, in the order the SDK sent them
    const items = envelopes.flatMap((envelope) => [...envelope[1]])
    const events = items.filter(([header]) => header.type === "event")
    expect(events).toHaveLength(1)

    const event = events[0]?.[1]
    expect(event).toMatchObject({
      exception: { values: [{ type: "Error", value: "boom" }] },
      contexts: { details: { alertId: 7 } },
    })
  })
})
