import type { ErrorEvent, EventHint } from "@sentry/nextjs"
import { env, isProduction } from "@/env"

/**
 * The DSN of the production deployment, the only one that reports. Locally
 * and on staging `Sentry.init` gets none, so the SDK sends nothing.
 */
export const sentryDsn = isProduction ? env.NEXT_PUBLIC_SENTRY_DSN : undefined

/**
 * What the three `Sentry.init` share. Without a DSN the SDK is off, even where
 * it would fall back to SENTRY_DSN (edge). The environment stays
 * "production", the name the events had before; the SDK default would be
 * "vercel-production".
 */
export const sentryInitOptions = {
  dsn: sentryDsn,
  enabled: sentryDsn !== undefined,
  environment: "production",
}

/**
 * tRPC failures are reported once, where the procedure fails (`sentryMiddleware`
 * in `src/server/api/trpc.ts`), and only when they are server faults.
 *
 * Drops the rest: `TRPCError`s with a client code (UNAUTHORIZED, BAD_REQUEST,
 * NOT_FOUND, …) are expected outcomes, and a `TRPCClientError` is the caller's
 * copy of a failure the procedure already reported.
 */
export function dropExpectedTrpcErrors(
  event: ErrorEvent,
  hint: EventHint
): ErrorEvent | null {
  const error = hint.originalException
  if (!(error instanceof Error)) return event
  if (error.name === "TRPCClientError") return null
  if (
    error.name === "TRPCError" &&
    (error as Error & { code?: unknown }).code !== "INTERNAL_SERVER_ERROR"
  ) {
    return null
  }
  return event
}
