import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "./schema/index"

export type SupaBaseDb = PostgresJsDatabase<typeof schema>
