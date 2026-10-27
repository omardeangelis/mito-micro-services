import { Effect, Schema } from "effect"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

/**
 * Who may call an internal route: a Google service, with an OIDC token Google
 * signs for `serviceAccount` (Cloud Scheduler's, the import queue's), issued
 * for `audience` (the URL of the service, as the job or the task sets it).
 */
export type OidcCaller = { audience: string; serviceAccount: string }

/** The request has no valid token of the caller. */
export class OidcUnauthorized extends Schema.TaggedError<OidcUnauthorized>()(
  "OidcUnauthorized",
  { reason: Schema.String }
) {}

// Google's ID tokens carry either form of the issuer
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

/** The keys Google signs ID tokens with (jose caches them). */
export const googleKeys = () =>
  createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"))

/**
 * Lets a request through only with a Google ID token in its `Authorization`
 * header, signed with `keys` (RS256 only), not expired, for the caller's
 * audience and with the caller's verified email.
 */
export const verifyIdToken = (
  caller: OidcCaller,
  keys: JWTVerifyGetKey,
  authorization: string | undefined
) =>
  Effect.gen(function* () {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : ""
    if (!token) {
      return yield* new OidcUnauthorized({ reason: "no bearer token" })
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
        new OidcUnauthorized({
          reason: cause instanceof Error ? cause.message : "invalid token",
        }),
    })
    if (
      payload.email !== caller.serviceAccount ||
      payload.email_verified !== true
    ) {
      return yield* new OidcUnauthorized({
        reason: "not the caller's service account",
      })
    }
  })
