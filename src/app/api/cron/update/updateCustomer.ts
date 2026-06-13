import { eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { customers } from "@/server/db/schema/customers"

async function updateCustomerAge(todayMonth: number, todayDay: number) {
  const customersToUpdate = await db
    .select()
    .from(customers)
    .where(
      sql`EXTRACT(MONTH FROM "birthday_date") = ${todayMonth} AND EXTRACT(DAY FROM "birthday_date") = ${todayDay}`
    )

  for (const customer of customersToUpdate) {
    const newAge = Number(customer.age) + 1

    await db
      .update(customers)
      .set({
        age: newAge,
      })
      .where(eq(customers.id, customer.id))
  }
}

export { updateCustomerAge }
