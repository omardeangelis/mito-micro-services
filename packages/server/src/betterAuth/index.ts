import { env } from "@mito/env"
import { parseAllowedHosts } from "@mito/env/allowedHosts"
import { type Auth, type AuthConfig, buildAuth } from "./config"
import { SEED_ACCOUNTS } from "./devLogin"
import { magicLinkSender } from "./mail"

type AuthEnv = Parameters<typeof magicLinkSender>[0] &
  Partial<
    Record<
      | "BETTER_AUTH_URL"
      | "BETTER_AUTH_ALLOWED_HOSTS"
      | "BETTER_AUTH_SECRET"
      | "AUTH_TEST_LOGIN"
      | "AUTH_ALLOWED_EMAILS"
      | "AZURE_AD_CLIENT_ID"
      | "AZURE_AD_CLIENT_SECRET"
      | "AZURE_AD_TENANT_ID",
      string
    >
  >

/**
 * Whether the frontend is on this machine. `NODE_ENV` alone isn't enough:
 * `@mito/env` makes it "development" when it is missing
 */
const isLocal = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)

/**
 * The configuration of better-auth from these env vars. The test logins only
 * with `AUTH_TEST_LOGIN` exactly "true" (fail closed, OQ6), the email one also
 * with a sender, the quick one also in `NODE_ENV=development` with the
 * frontend on this machine (on the seed of `mito_local`); Azure when its
 * three vars are set.
 */
export function authConfigFrom(vars: AuthEnv): AuthConfig {
  if (!vars.BETTER_AUTH_URL || !vars.BETTER_AUTH_SECRET) {
    throw new Error("better-auth needs BETTER_AUTH_URL and BETTER_AUTH_SECRET")
  }
  // Here and not in @mito/env: the staging build reads a Sensitive variable
  // of Vercel as "[SENSITIVE]", and only the functions get the real value
  if (vars.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET needs at least 32 characters")
  }
  const { AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID } =
    vars
  const testLogin = vars.AUTH_TEST_LOGIN === "true"
  return {
    baseURL: vars.BETTER_AUTH_URL,
    allowedHosts: parseAllowedHosts(
      vars.BETTER_AUTH_ALLOWED_HOSTS,
      vars.BETTER_AUTH_URL
    ),
    secret: vars.BETTER_AUTH_SECRET,
    azure:
      AZURE_AD_CLIENT_ID && AZURE_AD_CLIENT_SECRET && AZURE_AD_TENANT_ID
        ? {
            clientId: AZURE_AD_CLIENT_ID,
            clientSecret: AZURE_AD_CLIENT_SECRET,
            tenantId: AZURE_AD_TENANT_ID,
          }
        : undefined,
    testLogin,
    sendMagicLink: testLogin ? magicLinkSender(vars) : undefined,
    devAccounts:
      testLogin &&
      vars.NODE_ENV === "development" &&
      isLocal(vars.BETTER_AUTH_URL)
        ? SEED_ACCOUNTS
        : undefined,
    allowedEmails: new Set(
      (vars.AUTH_ALLOWED_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  }
}

let instance: Auth | undefined

/** The better-auth instance of the app, built from `@mito/env` on first use. */
export const getAuth = (): Auth => (instance ??= buildAuth(authConfigFrom(env)))
