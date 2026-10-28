import { Cause, Effect, Exit, Layer } from "effect"
import { getAuth } from "./betterAuth"
import { AuthSession, readSession, type Session } from "./betterAuth/session"
import { serverLayer } from "./effect/server"
import { requestSession } from "./requestSession"

export type { Session }

/**
 * The session of the request with `headers`, from better-auth's cookie (spec
 * auth-better-auth, T8): none without a cookie, for an expired or deleted
 * session, or for a deactivated user. A failed read is logged and thrown,
 * rather than taken for no session.
 */
export async function readRequestSession(
  headers: Headers
): Promise<Session | null> {
  const exit = await Effect.runPromiseExit(
    readSession(headers).pipe(
      Effect.provide(Layer.merge(AuthSession.layerOf(getAuth()), serverLayer))
    )
  )
  if (Exit.isSuccess(exit)) return exit.value
  console.error("Session read failed:", Cause.pretty(exit.cause))
  throw new Error("Session read failed")
}

/**
 * The session of the request being served. In the backend (`apps/api`) it is
 * the one the backend read for the request (`requestSession`); in Next.js the
 * one of `headers`, the request's.
 */
export const getServerAuthSession = (
  headers?: Headers
): Promise<Session | null> => {
  const fromBackend = requestSession.getStore()
  if (fromBackend) return Promise.resolve(fromBackend.session)
  if (!headers) {
    return Promise.reject(
      new Error("getServerAuthSession needs the request's headers")
    )
  }
  return readRequestSession(headers)
}
