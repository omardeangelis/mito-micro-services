/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from "@faker-js/faker"
import type * as schema from "../schema/index"
import { practices } from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { generateRandomProductKey } from "../../../lib/constants/productMap"
import { stateEnum } from "../schema/pratiche"
import { loadEnv } from "@/lib/global/env"

loadEnv()

export const createPratiche = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const itemToInsert = 200

  for (let i = 0; i < itemToInsert; i++) {
    const newPratica = {
      praticaId: faker.string.numeric(10),
      region: faker.location.country(),
      desPuntoVendita: faker.company.name(),
      desConvenzionato: faker.location.countryCode(),
      subagente: faker.person.firstName(),
      rateTotali: faker.number.int({ min: 1, max: 124 }),
      importoRata: faker.finance.amount(),
      debitoResiduo: faker.finance.amount(),
      importoFinanziato: faker.finance.amount(),
      fileName: "fromSeed",
      importoErogato: faker.finance.amount(),
      dataLiquidazione: faker.date.past(),
      paymentMethod: faker.finance.transactionType(),
      ratePagate: faker.number.int({ min: 1, max: 124 }),
      state: faker.helpers.arrayElement(stateEnum),
      isWave: faker.helpers.arrayElement([true, false]),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      productId: generateRandomProductKey(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }

    await db.insert(practices).values(newPratica)
  }
}
