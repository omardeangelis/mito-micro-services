import { afterEach, describe, expect, it, vi } from "vitest"

const DSN = "https://key@o1.ingest.sentry.io/1"

/** The DSN the Sentry configs get, built from these env vars. */
async function loadSentryDsn(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  vi.resetModules()
  return (await import("@/lib/utils/sentry")).sentryDsn
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("sentryDsn", () => {
  it("è il DSN sulla deployment di produzione", async () => {
    expect(
      await loadSentryDsn({
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN: DSN,
      })
    ).toBe(DSN)
  })

  it.each([
    ["sullo staging", { NEXT_PUBLIC_VERCEL_ENV: "preview" }],
    ["in locale, anche con un build di produzione", { NODE_ENV: "production" }],
  ])("manca %s, anche con il DSN impostato", async (_, vars) => {
    expect(
      await loadSentryDsn({ ...vars, NEXT_PUBLIC_SENTRY_DSN: DSN })
    ).toBeUndefined()
  })
})
