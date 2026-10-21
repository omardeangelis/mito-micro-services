/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as schema from "@mito/db/schema/index"
import { customerToPratica, customers, practices } from "@mito/db/schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { loadEnv } from "@/lib/global/loadDbEnv"

loadEnv()

export const createCustomerToPraticaRelations = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const customersDTO = await db.select({ id: customers.id }).from(customers)
  const practicesDTO = await db
    .select({ id: practices.praticaId })
    .from(practices)

  for (let i = 0; i < customersDTO.length; i++) {
    const newCustomerToPratica = {
      customerId: customersDTO[i]!.id,
      praticaId: practicesDTO[i]!.id,
      customer: customersDTO[i],
      pratica: practicesDTO[i],
      customerRole: schema.getRandomCustomerRole(),
    }

    await db.insert(customerToPratica).values(newCustomerToPratica)
  }
}
