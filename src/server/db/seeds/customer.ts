/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from "@faker-js/faker"
import type * as schema from "../schema/index"
import { customers } from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { nanoid } from "nanoid"
import { loadEnv } from "@/lib/global/env"

loadEnv()

export const createCustomers = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const itemToInsert = 200

  for (let i = 0; i < itemToInsert; i++) {
    const newCustomer = {
      id: nanoid(),
      fullName: faker.person.fullName(),
      name: faker.person.firstName(),
      surname: faker.person.lastName(),
      fiscalCode: faker.string.alpha(16).toUpperCase() as Uppercase<string>,
      email: faker.internet.email(),
      birthdayDate: faker.date.past(),
      phoneNumber: faker.string.numeric(10),
      address: faker.location.streetAddress(),
      cap: faker.location.zipCode("#####"),
      comune: faker.location.city(),
      fileName: "fromSeed",
      provincia: faker.location.state(),
      reddito: faker.finance.amount(),
      occupazione: faker.person.jobTitle(),
      tempID: nanoid(),
      uniqueHash: nanoid(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
      source: "passaparola" as const,
    }

    await db.insert(customers).values(newCustomer)
  }
}
