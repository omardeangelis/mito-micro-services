import { Context, Data, Effect, Layer } from "effect"
import { type JWTVerifyGetKey } from "jose"
import { type OidcCaller, verifyIdToken } from "../oidc"

export { googleKeys } from "../oidc"

/**
 * Who may start the crons: Cloud Scheduler, with an OIDC token Google signs
 * for `serviceAccount` (the scheduler's), issued for `audience` (the URL of
 * the service, as the scheduler job sets it).
 */
export type CronCaller = OidcCaller

/** The request has no valid token of the scheduler. */
export class CronUnauthorized extends Data.TaggedError("CronUnauthorized")<{
  readonly reason: string
}> {}

/** The service has no CronCaller: no cron runs. */
export class CronNotConfigured extends Data.TaggedError("CronNotConfigured") {}

export class CronAuth extends Context.Service<
  CronAuth,
  {
    /** Checks the `Authorization` header of a cron request. */
    readonly verify: (
      authorization: string | undefined
    ) => Effect.Effect<void, CronUnauthorized | CronNotConfigured>
  }
>()("CronAuth") {}

/**
 * Lets a request through only with the scheduler's Google ID token
 * (`verifyIdToken`).
 */
export const cronAuth = (caller: CronCaller, keys: JWTVerifyGetKey) =>
  Layer.succeed(CronAuth, {
    verify: (authorization) =>
      verifyIdToken(caller, keys, authorization).pipe(
        Effect.mapError(({ reason }) => new CronUnauthorized({ reason }))
      ),
  })

/** Without a CronCaller every cron request is refused. */
export const cronAuthDisabled = Layer.succeed(CronAuth, {
  verify: () => Effect.fail(new CronNotConfigured()),
})
