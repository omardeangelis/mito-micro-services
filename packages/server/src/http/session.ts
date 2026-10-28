import { Context, Effect, Layer } from "effect"
import { getServerAuthSession, type Session } from "../auth"

/**
 * The session of a request to `/api/v1`. On the backend it is the one read
 * once for every `/api/*` request (`requestSession`), so the endpoints don't
 * read the cookie again; the tests give their own (H10 of
 * brain/chore/fase-2-httpapi.md)
 */
export class SessionReader extends Context.Service<
  SessionReader,
  { readonly read: (headers: Headers) => Effect.Effect<Session | null> }
>()("@mito/server/http/SessionReader") {
  /** A session that can't be read is a defect, a 500, as in tRPC */
  static readonly layer = Layer.succeed(
    SessionReader,
    SessionReader.of({
      read: (headers) => Effect.promise(() => getServerAuthSession(headers)),
    })
  )
}
