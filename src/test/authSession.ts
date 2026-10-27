import { makeSignature } from "better-auth/crypto"
import { authSessions } from "@mito/db/schema/auth"
import { testDb } from "@/test/db"

const DAY = 24 * 60 * 60 * 1000

/** better-auth's session cookie on https, as on staging and in production. */
export const SESSION_COOKIE = "__Secure-better-auth.session_token"

/**
 * A better-auth session of `userId` in the test database, valid for another 20
 * days unless `expiresAt` says otherwise, and the cookie the browser sends
 * for it: the token signed with the secret of vitest.config.ts.
 */
export async function signIn(
  userId: string,
  { expiresAt = new Date(Date.now() + 20 * DAY) }: { expiresAt?: Date } = {}
) {
  const token = `token-${userId}-${Math.random().toString(36).slice(2)}`
  await testDb
    .insert(authSessions)
    .values({ id: `session-${token}`, token, userId, expiresAt })
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("vitest.config.ts sets BETTER_AUTH_SECRET")
  const signed = `${token}.${await makeSignature(token, secret)}`
  return { token, cookie: `${SESSION_COOKIE}=${encodeURIComponent(signed)}` }
}
