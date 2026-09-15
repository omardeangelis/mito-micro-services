/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as schema from "../schema/index"
import { drizzle } from "drizzle-orm/postgres-js"
import { loadEnv } from "@/lib/global/env"
import { SYSTEM_OPERATOR_USER_ID } from "@/lib/constants/operator"
import { eq } from "drizzle-orm"
import postgres from "postgres"

loadEnv()

await (async function createSystemOperator(): Promise<void> {
  const dbConnection = postgres(process.env.SUPABASE_DB_CONNECTION_STRING!, {
    password: process.env.SUPABASE_MITO_PSW!,
    prepare: false,
  })
  const db = drizzle(dbConnection, { schema })

  const existing = await db
    .select({ id: schema.operators.id })
    .from(schema.operators)
    .where(eq(schema.operators.userId, SYSTEM_OPERATOR_USER_ID))

  if (existing[0]) {
    console.log(
      `Operatore di sistema già presente (id=${existing[0].id}), nessuna azione.`
    )
    process.exit(0)
  }

  const [created] = await db
    .insert(schema.operators)
    .values({
      userId: SYSTEM_OPERATOR_USER_ID,
      name: "Operatore",
      surname: "di Sistema",
    })
    .returning({ id: schema.operators.id })

  console.log(`Operatore di sistema creato con id=${created!.id}.`)
  process.exit(0)
})()
