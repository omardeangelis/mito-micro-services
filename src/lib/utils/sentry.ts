import type { ErrorEvent, EventHint } from "@sentry/nextjs"
import { env, isProduction } from "@mito/env"

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
 * in `packages/server/src/api/trpc.ts`), and only when they are server faults.
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

// Drizzle 0.45 reports a failed query as "Failed query: <sql>\nparams: <values>",
// and a log line may carry it with its stack after
const QUERY_PARAMS = /(Failed query: [\s\S]*?\nparams: )[\s\S]*?(?=\n\s+at |$)/g
const withoutParams = (text: string) =>
  text.replace(QUERY_PARAMS, "$1[removed]")

/**
 * Removes the parameters of a failed query from the event: they are the
 * values of the query, customers' data. The tRPC procedures and the import
 * routes already report the driver's error; this covers every other path, in
 * the exceptions and in the logs kept as breadcrumbs.
 */
export function dropQueryParams(event: ErrorEvent): ErrorEvent {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = withoutParams(exception.value)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message)
      breadcrumb.message = withoutParams(breadcrumb.message)
  }
  if (event.message) event.message = withoutParams(event.message)
  return event
}

/**
 * Removes the body of the request from the event: the SDK keeps it, and a
 * tRPC call carries customers' data in it, such as the codes of a file's
 * customers in `import.lookup` (AC31 of the import).
 */
export function dropRequestBody(event: ErrorEvent): ErrorEvent {
  if (event.request) delete event.request.data
  return event
}
