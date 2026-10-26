import type { ErrorEvent } from "@sentry/nextjs"
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
    [
      "sullo staging",
      { NEXT_PUBLIC_VERCEL_ENV: "production", NEXT_PUBLIC_APP_ENV: "staging" },
    ],
    ["su una preview", { NEXT_PUBLIC_VERCEL_ENV: "preview" }],
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
          NEXT_PUBLIC_VERCEL_ENV: "production",
          NEXT_PUBLIC_APP_ENV: "staging",
          NEXT_PUBLIC_SENTRY_DSN: DSN,
          SENTRY_DSN: DSN,
        })
      ).toMatchObject({ dsn: undefined, enabled: false })
    })
  }
)

describe("i parametri di una query fallita non arrivano a Sentry", () => {
  const QUERY = 'Failed query: insert into "t" ("name", "cf") values ($1, $2)'
  const FAILED = `${QUERY}\nparams: Mario Rossi,RSSMRA80A01H501U`
  const event = (): ErrorEvent => ({
    type: undefined,
    message: FAILED,
    exception: { values: [{ type: "Error", value: FAILED }] },
    breadcrumbs: [
      { message: `Cron update failed ${FAILED}\n    at step (cron.ts:1:1)` },
    ],
  })

  it("dropQueryParams li toglie da eccezioni, log e messaggio, e lascia la query", async () => {
    const { dropQueryParams } = await import("@/lib/utils/sentry")
    const scrubbed = dropQueryParams(event())

    expect(JSON.stringify(scrubbed)).not.toMatch(/Mario Rossi|RSSMRA80A01H501U/)
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      `${QUERY}\nparams: [removed]`
    )
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe(
      `Cron update failed ${QUERY}\nparams: [removed]\n    at step (cron.ts:1:1)`
    )
  })

  it("dropQueryParams lascia com'è un evento senza query fallite", async () => {
    const { dropQueryParams } = await import("@/lib/utils/sentry")
    const plain: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "params: niente" }] },
    }

    expect(dropQueryParams(structuredClone(plain))).toEqual(plain)
  })

  it("il beforeSend di sentry.server.config li toglie", async () => {
    const options = await loadSentryInit("server", {
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: DSN,
    })
    const beforeSend = options?.beforeSend
    if (!beforeSend) throw new Error("sentry.server.config has no beforeSend")
    const sent = await beforeSend(event(), {
      originalException: new Error(FAILED),
    })

    expect(JSON.stringify(sent)).not.toMatch(/Mario Rossi|RSSMRA80A01H501U/)
  })
})

describe("il corpo della richiesta non arriva a Sentry", () => {
  it("il beforeSend di sentry.server.config lo toglie e lascia l'URL", async () => {
    const options = await loadSentryInit("server", {
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: DSN,
    })
    const beforeSend = options?.beforeSend
    if (!beforeSend) throw new Error("sentry.server.config has no beforeSend")
    const url = "https://crm.example.it/api/trpc/import.lookup"

    const sent = await beforeSend(
      {
        type: undefined,
        request: {
          url,
          data: { json: { fiscalCodes: ["RSSMRA80A01H501U"] } },
        },
      },
      { originalException: new Error("boom") }
    )

    expect(JSON.stringify(sent)).not.toMatch(/RSSMRA80A01H501U/)
    expect(sent?.request?.url).toBe(url)
  })
})
