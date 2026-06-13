/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type * as schema from "../schema/index"
import { task, operators, customers } from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { faker } from "@faker-js/faker"
import { loadEnv } from "@/lib/global/env"

loadEnv()
export const createTasks = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  try {
    const operatorsDTO = await db.selectDistinct().from(operators)
    const customersDTO = await db.select().from(customers).limit(50)

    for await (const customer of customersDTO) {
      const randomOperator =
        operatorsDTO[Math.floor(Math.random() * operatorsDTO.length)]

      const newTask = {
        isActive: faker.datatype.boolean(),
        customerId: customer.id,
        operatorId: randomOperator!.id,
      }

      await db.insert(task).values(newTask)
    }
  } catch (error) {
    console.error(error)
  }
}
