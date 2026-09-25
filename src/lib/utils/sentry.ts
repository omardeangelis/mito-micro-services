import type { ErrorEvent, EventHint } from "@sentry/nextjs"

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
