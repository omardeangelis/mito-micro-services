// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@sentry/node", () => ({ init: vi.fn() }))

const DSN = "https://key@o1.ingest.sentry.io/1"

/** The options the backend passes to `Sentry.init` with these env vars. */
async function loadSentryInit(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  vi.resetModules()
  const Sentry = await import("@sentry/node")
  vi.mocked(Sentry.init).mockClear()
  await import("../instrument")
  return vi.mocked(Sentry.init).mock.calls[0]?.[0]
}

/** The beforeSend the backend passes to `Sentry.init` with these env vars. */
async function loadBeforeSend(vars: Record<string, string>) {
  const beforeSend = (await loadSentryInit(vars))?.beforeSend
  if (!beforeSend) throw new Error("instrument.ts has no beforeSend")
  return beforeSend
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("Sentry.init del backend", () => {
  it("in produzione è acceso, con il DSN e l'ambiente production", async () => {
    expect(
      await loadSentryInit({
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_SENTRY_DSN: DSN,
      })
    ).toMatchObject({ dsn: DSN, enabled: true, environment: "production" })
  })

  it.each([
    [
      "sullo staging, anche con i DSN impostati",
      {
        NEXT_PUBLIC_VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_SENTRY_DSN: DSN,
        SENTRY_DSN: DSN,
      },
    ],
    [
      "in locale, anche con un build di produzione",
      { NODE_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: DSN },
    ],
    ["in produzione senza DSN", { NEXT_PUBLIC_VERCEL_ENV: "production" }],
  ])("è spento %s", async (_, vars) => {
    expect(await loadSentryInit(vars)).toMatchObject({
      dsn: undefined,
      enabled: false,
    })
  })

  it("cattura solo gli errori: niente tracing, niente hook ESM", async () => {
    const options = await loadSentryInit({
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_SENTRY_DSN: DSN,
    })

    expect(options).not.toHaveProperty("tracesSampleRate")
    expect(options).not.toHaveProperty("tracesSampler")
    expect(options).toMatchObject({ registerEsmLoaderHooks: false })
  })
})

describe("il beforeSend del backend è quello di Next.js", () => {
  const PRODUCTION = {
    NEXT_PUBLIC_VERCEL_ENV: "production",
    NEXT_PUBLIC_SENTRY_DSN: DSN,
  }

  it("non manda gli errori tRPC del cliente, come NOT_FOUND", async () => {
    const beforeSend = await loadBeforeSend(PRODUCTION)
    const error = Object.assign(new Error("x"), {
      name: "TRPCError",
      code: "NOT_FOUND",
    })

    expect(
      await beforeSend({ type: undefined }, { originalException: error })
    ).toBeNull()
  })

  it("toglie i parametri di una query fallita", async () => {
    const beforeSend = await loadBeforeSend(PRODUCTION)
    const QUERY = 'Failed query: insert into "t" ("name", "cf") values ($1, $2)'
    const FAILED = `${QUERY}\nparams: Mario Rossi,RSSMRA80A01H501U`

    const sent = await beforeSend(
      {
        type: undefined,
        exception: { values: [{ type: "Error", value: FAILED }] },
      },
      { originalException: new Error(FAILED) }
    )

    expect(JSON.stringify(sent)).not.toMatch(/Mario Rossi|RSSMRA80A01H501U/)
    expect(sent?.exception?.values?.[0]?.value).toBe(
      `${QUERY}\nparams: [removed]`
    )
  })

  it("toglie il corpo della richiesta e lascia l'URL", async () => {
    const beforeSend = await loadBeforeSend(PRODUCTION)
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
