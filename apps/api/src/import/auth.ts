import { Context, Effect, Layer, Schema } from "effect"
import { type JWTVerifyGetKey } from "jose"
import { type OidcCaller, type OidcUnauthorized, verifyIdToken } from "../oidc"

/** The service has no caller for the import tasks: none runs. */
export class ImportNotConfigured extends Schema.TaggedError<ImportNotConfigured>()(
  "ImportNotConfigured",
  {}
) {}

export class ImportAuth extends Context.Service<
  ImportAuth,
  {
    /** Checks the `Authorization` header of a task of the import queue. */
    readonly verify: (
      authorization: string | undefined
    ) => Effect.Effect<void, OidcUnauthorized | ImportNotConfigured>
  }
>()("@mito/api/import/ImportAuth") {
  /**
   * Lets a task through only with the Google ID token of the queue's service
   * account, for the URL of the service (`verifyIdToken`).
   */
  static readonly layerOidc = (caller: OidcCaller, keys: JWTVerifyGetKey) =>
    Layer.succeed(
      ImportAuth,
      ImportAuth.of({
        verify: (authorization) => verifyIdToken(caller, keys, authorization),
      })
    )

  /** Without a caller every import task is refused. */
  static readonly layerDisabled = Layer.succeed(
    ImportAuth,
    ImportAuth.of({
      verify: () => Effect.fail(new ImportNotConfigured()),
    })
  )
}
