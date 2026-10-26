import { vi } from "vitest"
import { authAccounts } from "@mito/db/schema/auth"
import { type Auth, type AuthConfig, buildAuth } from "../config"
import { testDb } from "@/test/db"

export const BASE = "http://localhost:3000"

export const AZURE = {
  clientId: "client-id",
  clientSecret: "client-secret",
  tenantId: "tenant-id",
}

/** An instance for the tests: Azure on, test login off unless overridden. */
export const testAuth = (config: Partial<AuthConfig> = {}): Auth =>
  buildAuth({
    baseURL: BASE,
    secret: "s".repeat(40),
    azure: AZURE,
    testLogin: false,
    allowedEmails: new Set(),
    ...config,
  })

/** An instance, or a handler in front of one (`authHandler`). */
export type Target = Auth | ((request: Request) => Promise<Response>)

const handle = (target: Target, request: Request) =>
  typeof target === "function" ? target(request) : target.handler(request)

/** The Azure profile the fake token endpoint puts in the id token. */
export type Profile = { oid: string; email: string; name?: string }

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

/** An id token as Entra ID signs it; the code flow decodes it without the signature. */
const idToken = (profile: Profile) =>
  [
    base64url({ alg: "RS256", typ: "JWT" }),
    base64url({
      iss: `https://login.microsoftonline.com/${AZURE.tenantId}/v2.0`,
      aud: AZURE.clientId,
      sub: `sub-${profile.oid}`,
      tid: AZURE.tenantId,
      name: "Ada Lovelace",
      ...profile,
    }),
    "signature",
  ].join(".")

/**
 * Fakes Microsoft on `fetch`: the token endpoint answers with `profile`, and
 * every request to Microsoft is recorded. Anything else fails.
 */
export function fakeMicrosoft(profile: Profile) {
  const requests: { url: string; body: string }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = request.url
      requests.push({ url, body: await request.clone().text() })
      if (url.endsWith(`/${AZURE.tenantId}/oauth2/v2.0/token`)) {
        return Response.json({
          token_type: "Bearer",
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: idToken(profile),
          expires_in: 3600,
          scope: "openid profile email",
        })
      }
      throw new Error(`Unexpected fetch in the test: ${url}`)
    })
  )
  return { requests }
}

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ")

/**
 * A full login with Microsoft: the start, which the browser follows to
 * Microsoft, and the callback with the code. Returns both responses and the
 * authorization URL.
 */
export async function loginWithMicrosoft(
  auth: Target,
  profile: Profile,
  body: Record<string, unknown> = {}
) {
  const microsoft = fakeMicrosoft(profile)
  const start = await handle(
    auth,
    new Request(`${BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ provider: "microsoft", ...body }),
    })
  )
  const { url } = (await start.clone().json()) as { url: string }
  const authorization = new URL(url)
  const state = authorization.searchParams.get("state") ?? ""
  const callback = await handle(
    auth,
    new Request(
      `${BASE}/api/auth/callback/microsoft?code=the-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookiesOf(start) } }
    )
  )
  return { start, callback, authorization, microsoft }
}

/** Links the Azure account `oid` to `userId`, as the copy of PR B does. */
export const linkMicrosoft = (userId: string, oid: string) =>
  testDb.insert(authAccounts).values({
    id: `account-${oid}`,
    userId,
    providerId: "microsoft",
    accountId: oid,
  })

/** Asks for the link of the email login; the response of the request. */
export const requestLink = (
  auth: Target,
  email: string,
  body: Record<string, unknown> = {}
) =>
  handle(
    auth,
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        email,
        callbackURL: "/dashboard",
        errorCallbackURL: "/login?error=1",
        ...body,
      }),
    })
  )

/** Opens a link of the email login, as the browser does. */
export const openLink = (auth: Target, url: string) =>
  handle(auth, new Request(url, { headers: { origin: BASE } }))
