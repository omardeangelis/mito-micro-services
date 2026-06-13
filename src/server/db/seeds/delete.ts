/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as schema from "../schema/index"
import { drizzle } from "drizzle-orm/postgres-js"
import { loadEnv } from "@/lib/global/env"
import postgres from "postgres"

loadEnv()

await (async function seed(): Promise<void> {
  const dbConnection = postgres(process.env.SUPABASE_DB_CONNECTION_STRING!, {
    password: process.env.SUPABASE_MITO_PSW!,
    prepare: false,
  })
  const db = drizzle(dbConnection, { schema })
  await db.delete(schema.task)
  await db.delete(schema.customerToPratica)
  await db.delete(schema.practices)
  await db.delete(schema.customers)
  await db.delete(schema.products)
  await db.delete(schema.sessions)
  await db.delete(schema.accounts)
  await db.delete(schema.users)
  await db.delete(schema.chatToOperator)
  await db.delete(schema.operators)
  await db.delete(schema.messages)
  await db.delete(schema.chat)
  process.exit(0)
})()
