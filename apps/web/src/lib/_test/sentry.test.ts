import { describe, expect, it } from "vitest"
import { sentryDsn } from "@/lib/sentry"

const DSN = "https://key@o0.ingest.sentry.io/0"

describe("sentryDsn", () => {
  it("is the DSN of the production deployment", () => {
    expect(
      sentryDsn({ VITE_VERCEL_ENV: "production", VITE_SENTRY_DSN: DSN })
    ).toBe(DSN)
  })

  it("is undefined on staging, on the previews, locally and without a DSN", () => {
    expect(
      sentryDsn({
        VITE_VERCEL_ENV: "production",
        VITE_APP_ENV: "staging",
        VITE_SENTRY_DSN: DSN,
      })
    ).toBeUndefined()
    expect(
      sentryDsn({ VITE_VERCEL_ENV: "preview", VITE_SENTRY_DSN: DSN })
    ).toBeUndefined()
    expect(sentryDsn({ VITE_SENTRY_DSN: DSN })).toBeUndefined()
    expect(sentryDsn({ VITE_VERCEL_ENV: "production" })).toBeUndefined()
  })
})
