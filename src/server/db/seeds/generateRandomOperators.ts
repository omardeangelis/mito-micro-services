/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as schema from "../schema/index"
import { drizzle } from "drizzle-orm/postgres-js"

import { createUsersAndOperators } from "./users"
import { loadEnv } from "@/lib/global/env"
import postgres from "postgres"

loadEnv()

await (async function seed(): Promise<void> {
  const dbConnection = postgres(process.env.SUPABASE_DB_CONNECTION_STRING!)

  const db = drizzle(dbConnection, { schema })

  const operatorsNumber = await db
    .selectDistinct()
    .from(schema.operators)
    .orderBy(schema.operators.id)

  if (operatorsNumber.length < 10) {
    await createUsersAndOperators(db)
  }
  process.exit(0)
})()
