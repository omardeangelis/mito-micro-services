// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { type User } from "next-auth"
import { type EmailConfig } from "next-auth/providers/email"

// The real NextAuth configuration, which the other tests get mocked
vi.unmock("@mito/server/auth")
// None of these cases reaches the database
vi.mock("@mito/db", () => ({ db: {} }))
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }))
// The check of a deactivated user reads the database: here nobody is one
// (that check has its own tests, authDisabled*.db.test.ts)
vi.mock("../services/auth/disabled", async () => {
  const { Effect } = await import("effect")
  return { isUserDisabled: () => Effect.succeed(false) }
})

const AZURE = {
  AZURE_AD_CLIENT_ID: "client-id",
  AZURE_AD_CLIENT_SECRET: "client-secret",
  AZURE_AD_TENANT_ID: "tenant-id",
}
const SENDGRID = {
  SENDGRID_USERNAME: "apikey",
  SENDGRID_API_KEY: "sendgrid-key",
  SENDGRID_SERVER: "smtp.sendgrid.net",
  SENDGRID_PORT: "587",
}

/** The NextAuth options the module builds from these env vars. */
async function loadAuthOptions(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  vi.resetModules()
  return (await import("../auth")).authOptions
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("auth in production", () => {
  it("offre solo Azure, anche con SendGrid configurato, e non filtra gli utenti", async () => {
    const authOptions = await loadAuthOptions({
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NODE_ENV: "production",
      ...AZURE,
      ...SENDGRID,
    })

    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "azure-ad",
    ])
    expect(
      await authOptions.callbacks!.signIn!({
        user: { id: "provider-id", email: "nuovo@x.it" } as User,
        account: null,
      })
    ).toBe(true)
  })
})

describe("auth on staging", () => {
  it("con SendGrid offre anche il link via email, che la produzione toglie", async () => {
    const authOptions = await loadAuthOptions({
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "staging",
      NODE_ENV: "production",
      ...AZURE,
      ...SENDGRID,
    })

    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "azure-ad",
      "email",
    ])
  })
})

describe("auth with next dev", () => {
  it("senza Azure offre il link via email, che compare nel terminale invece di partire", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const authOptions = await loadAuthOptions({
      NODE_ENV: "development",
      ...SENDGRID,
    })

    expect(authOptions.providers.map((provider) => provider.id)).toEqual([
      "email",
    ])
    const email = authOptions.providers[0] as EmailConfig
    const url = "http://localhost:3000/api/auth/callback/email?token=t"
    await email.options.sendVerificationRequest!({
      identifier: "mario.rossi@x.it",
      url,
    } as Parameters<EmailConfig["sendVerificationRequest"]>[0])

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`mario.rossi@x.it: ${url}`)
    )
  })
})
