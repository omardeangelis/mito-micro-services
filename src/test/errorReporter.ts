import { type Cause } from "effect"

/**
 * What the server reported with `ErrorReporter` (the test setup replaces its
 * Sentry layer). Empty it in `beforeEach`.
 */
export const reportedErrors: {
  cause: Cause.Cause<unknown>
  data: Record<string, unknown>
}[] = []
