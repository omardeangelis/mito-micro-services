import { Context, Data, Effect, Layer } from "effect"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

/**
 * Who may start the crons: Cloud Scheduler, with an OIDC token Google signs
 * for `serviceAccount` (the scheduler's), issued for `audience` (the URL of
 * the service, as the scheduler job sets it).
 */
export type CronCaller = { audience: string; serviceAccount: string }

/** The request has no valid token of the scheduler. */
export class CronUnauthorized extends Data.TaggedError("CronUnauthorized")<{
  readonly reason: string
}> {}

/** The service has no CronCaller: no cron runs. */
export class CronNotConfigured extends Data.TaggedError("CronNotConfigured") {}

export class CronAuth extends Context.Tag("CronAuth")<
  CronAuth,
  {
    /** Checks the `Authorization` header of a cron request. */
    readonly verify: (
      authorization: string | undefined
    ) => Effect.Effect<void, CronUnauthorized | CronNotConfigured>
  }
>() {}

// Google's ID tokens carry either form of the issuer
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

/** The keys Google signs ID tokens with (jose caches them). */
export const googleKeys = () =>
  createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))

/**
 * Lets a request through only with a Google ID token, signed with `keys`
 * (RS256 only), not expired, for the caller's audience and with the caller's
 * verified email.
 */
export const cronAuth = (caller: CronCaller, keys: JWTVerifyGetKey) =>
  Layer.succeed(CronAuth, {
    verify: (authorization) =>
      Effect.gen(function* () {
        const token = authorization?.startsWith("Bearer ")
          ? authorization.slice("Bearer ".length)
          : ""
        if (!token) {
          return yield* new CronUnauthorized({ reason: "no bearer token" })
        }
        const { payload } = yield* Effect.tryPromise({
          try: () =>
            jwtVerify(token, keys, {
              issuer: GOOGLE_ISSUERS,
              audience: caller.audience,
              algorithms: ["RS256"],
              requiredClaims: ["exp", "iat", "email"],
              clockTolerance: 30,
            }),
          catch: (cause) =>
            new CronUnauthorized({
              reason: cause instanceof Error ? cause.message : "invalid token",
            }),
        })
        if (
          payload.email !== caller.serviceAccount ||
          payload.email_verified !== true
        ) {
          return yield* new CronUnauthorized({
            reason: "not the scheduler's service account",
          })
        }
      }),
  })

/** Without a CronCaller every cron request is refused. */
export const cronAuthDisabled = Layer.succeed(CronAuth, {
  verify: () => Effect.fail(new CronNotConfigured()),
})
