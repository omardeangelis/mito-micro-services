import { eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { customers } from "@/server/db/schema/customers"

/**
 * The `update` cron: adds a year to the age of the customers born on this
 * month and day. It adds one at every run, so it runs once a day. Returns how
 * many it updated.
 */
async function updateCustomerAge(
  todayMonth: number,
  todayDay: number
): Promise<number> {
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
  return customersToUpdate.length
}

export { updateCustomerAge }
