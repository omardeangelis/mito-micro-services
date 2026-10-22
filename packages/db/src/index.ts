import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema/index"
import { connect } from "./connect"

export const db = drizzle(connect(), { schema })
