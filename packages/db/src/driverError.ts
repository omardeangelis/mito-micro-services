import { DrizzleQueryError } from "drizzle-orm"

/**
 * The error the database driver threw. Drizzle 0.45 wraps it in a
 * DrizzleQueryError, whose message holds the SQL and its parameters, so the
 * data of the query: the SQLSTATE (`code`) and the driver's message are on the
 * error it wraps. Anything else comes back as it is.
 */
export const driverError = (error: unknown): unknown =>
  error instanceof DrizzleQueryError && error.cause ? error.cause : error
