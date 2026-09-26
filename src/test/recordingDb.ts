import { drizzle } from "drizzle-orm/pg-proxy"
import { type db } from "@/server/db"
import * as schema from "@/server/db/schema/index"

/** Every statement `recordingDb` got, in order. Empty it before each test. */
export const recordedStatements: { sql: string; params: unknown[] }[] = []

/**
 * A Drizzle client that runs nothing: it records each statement it gets and
 * answers with no rows. It stands in for the database when what the code sends
 * is the behavior under test.
 */
export const recordingDb = drizzle(
  async (sql, params) => {
    recordedStatements.push({ sql, params })
    return { rows: [] }
  },
  { schema }
) as unknown as typeof db
