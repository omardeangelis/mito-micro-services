import { Context, Data, Effect, Layer } from "effect"
import { type Db, type DbError } from "../effect/db"
import { isUserDisabled } from "../services/auth/disabled"
import { type Auth } from "./config"

/** The session the app reads, the same shape as NextAuth's (D2). */
export type Session = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
  /** When it ends, as an ISO string. */
  expires: string
}

/** What better-auth finds for a request's cookie. */
type Found = {
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }
  session: { expiresAt: Date }
}

/** better-auth's read of the session of a request, swappable in tests. */
export class AuthSession extends Context.Tag("AuthSession")<
  AuthSession,
  { readonly read: (headers: Headers) => Promise<Found | null> }
>() {}

/** `AuthSession` on a better-auth instance. */
export const authSessionOf = (auth: Auth) =>
  Layer.succeed(AuthSession, {
    read: (headers) => auth.api.getSession({ headers }),
  })

/** better-auth couldn't read the session (its database, a bad cookie format). */
export class SessionReadFailed extends Data.TaggedError("SessionReadFailed")<{
  readonly cause: unknown
}> {}

/**
 * The session as the app sees it: none for a deactivated user, at every read
 * and without cache (D3, AC15).
 */
export const activeSession = (
  found: Found | null
): Effect.Effect<Session | null, DbError, Db> =>
  Effect.gen(function* () {
    if (!found) return null
    if (yield* isUserDisabled({ id: found.user.id })) return null
    const { id, name, email, image } = found.user
    return {
      user: { id, name, email, image },
      expires: found.session.expiresAt.toISOString(),
    }
  })

/**
 * The session of the request with `headers`, or null: no cookie, an expired
 * or deleted session, or a deactivated user.
 */
export const readSession = (
  headers: Headers
): Effect.Effect<
  Session | null,
  SessionReadFailed | DbError,
  AuthSession | Db
> =>
  Effect.gen(function* () {
    const { read } = yield* AuthSession
    const found = yield* Effect.tryPromise({
      try: () => read(headers),
      catch: (cause) => new SessionReadFailed({ cause }),
    })
    return yield* activeSession(found)
  })
