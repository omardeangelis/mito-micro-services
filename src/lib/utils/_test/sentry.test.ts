import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({})),
}))

const DSN = "https://key@o1.ingest.sentry.io/1"

const CONFIGS = {
  client: () => import("../../../../sentry.client.config"),
  server: () => import("../../../../sentry.server.config"),
  edge: () => import("../../../../sentry.edge.config"),
}

/** The options a Sentry config passes to `Sentry.init` with these env vars. */
async function loadSentryInit(
  config: keyof typeof CONFIGS,
  vars: Record<string, string>
) {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  vi.resetModules()
  const Sentry = await import("@sentry/nextjs")
  vi.mocked(Sentry.init).mockClear()
  await CONFIGS[config]()
  return vi.mocked(Sentry.init).mock.calls[0]?.[0]
}

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

describe.each(Object.keys(CONFIGS) as (keyof typeof CONFIGS)[])(
  "Sentry.init in sentry.%s.config",
  (config) => {
    it("in produzione manda gli eventi con l'ambiente production", async () => {
      expect(
        await loadSentryInit(config, {
          NEXT_PUBLIC_VERCEL_ENV: "production",
          NEXT_PUBLIC_SENTRY_DSN: DSN,
        })
      ).toMatchObject({ dsn: DSN, enabled: true, environment: "production" })
    })

    it("sullo staging è spento, anche con i DSN impostati", async () => {
      expect(
        await loadSentryInit(config, {
          NEXT_PUBLIC_VERCEL_ENV: "preview",
          NEXT_PUBLIC_SENTRY_DSN: DSN,
          SENTRY_DSN: DSN,
        })
      ).toMatchObject({ dsn: undefined, enabled: false })
    })
  }
)
