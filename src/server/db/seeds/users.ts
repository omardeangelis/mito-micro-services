/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from "@faker-js/faker"
import type * as schema from "../schema/index"
import {
  userRoles,
  users,
  operators,
  practices,
  customers,
} from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { eq } from "drizzle-orm"
import { loadEnv } from "@/lib/global/env"

loadEnv()
export const createUsersAndOperators = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const itemToInsert = 13

  for (let i = 0; i < itemToInsert; i++) {
    const userId = faker.string.uuid()
    const newUser = {
      id: userId,
      name: faker.person.fullName(),
      email: faker.internet.email(),
      emailVerified: faker.date.past(),
      role: userRoles.enumValues[1],
      image: faker.image.avatar(),
    }

    const newOperator = {
      userId: userId,
      name: faker.person.firstName(),
      surname: faker.person.lastName(),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    }

    await db.insert(users).values(newUser)
    await db.insert(operators).values(newOperator)
  }
}

export const popolatePracticesOperatorRelation = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const practicesDTO = await db.select({ id: practices.id }).from(practices)
  const customersDTO = await db.select().from(customers)
  const operatorsDTO = await db.select().from(operators)

  for await (const practice of practicesDTO) {
    const randomOperator =
      operatorsDTO[Math.floor(Math.random() * operatorsDTO.length)]

    await db
      .update(practices)
      .set({ operatorId: randomOperator!.id })
      .where(eq(practices.id, practice.id))
  }

  for await (const customer of customersDTO) {
    const randomOperator =
      operatorsDTO[Math.floor(Math.random() * operatorsDTO.length)]

    await db
      .update(customers)
      .set({ operatorId: randomOperator!.id })
      .where(eq(customers.id, customer.id))
  }
}
