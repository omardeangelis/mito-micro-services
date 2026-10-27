import { Context, Data, Effect, Layer } from "effect"
import { type JWTVerifyGetKey } from "jose"
import { type OidcCaller, type OidcUnauthorized, verifyIdToken } from "../oidc"

/** The service has no caller for the import tasks: none runs. */
export class ImportNotConfigured extends Data.TaggedError(
  "ImportNotConfigured"
) {}

export class ImportAuth extends Context.Tag("ImportAuth")<
  ImportAuth,
  {
    /** Checks the `Authorization` header of a task of the import queue. */
    readonly verify: (
      authorization: string | undefined
    ) => Effect.Effect<void, OidcUnauthorized | ImportNotConfigured>
  }
>() {}

/**
 * Lets a task through only with the Google ID token of the queue's service
 * account, for the URL of the service (`verifyIdToken`).
 */
export const importAuth = (caller: OidcCaller, keys: JWTVerifyGetKey) =>
  Layer.succeed(ImportAuth, {
    verify: (authorization) => verifyIdToken(caller, keys, authorization),
  })

/** Without a caller every import task is refused. */
export const importAuthDisabled = Layer.succeed(ImportAuth, {
  verify: () => Effect.fail(new ImportNotConfigured()),
})
