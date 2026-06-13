/* eslint-disable @typescript-eslint/no-unsafe-call */
import { createCustomers } from "./customer"
import { createPratiche } from "./practice"
import { createCustomerToPraticaRelations } from "./customerToPratica"
import { createProducts } from "./products"
import * as schema from "../schema/index"
import { drizzle } from "drizzle-orm/postgres-js"
import {
  createUsersAndOperators,
  popolatePracticesOperatorRelation,
} from "./users"
import { ne } from "drizzle-orm"
import { createChatAndMessages } from "./chat"
import { createTasks } from "./task"
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
  await db.delete(schema.users).where(ne(schema.users.role, "ADMIN"))
  await db.delete(schema.chatToOperator)
  await db.delete(schema.operators)
  await db.delete(schema.messages)
  await db.delete(schema.chat)

  await createUsersAndOperators(db)
  await createProducts(db)
  await createCustomers(db)
  await createPratiche(db)
  await createCustomerToPraticaRelations(db)
  await popolatePracticesOperatorRelation(db)
  await createChatAndMessages(db)
  await createTasks(db)
  process.exit(0)
})()
