import { Effect } from "effect"
import { eq, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { type Db, type DbError, query } from "@mito/server/effect/db"

/**
 * The `update` cron: adds a year to the age of the customers born on this
 * month and day. It adds one at every run, so it runs once a day. Returns how
 * many it updated.
 */
const updateCustomerAge = Effect.fnUntraced(function* (
  todayMonth: number,
  todayDay: number
): Effect.fn.Return<number, DbError, Db> {
  const customersToUpdate = yield* query((client) =>
    client
      .select()
      .from(customers)
      .where(
        sql`EXTRACT(MONTH FROM "birthday_date") = ${todayMonth} AND EXTRACT(DAY FROM "birthday_date") = ${todayDay}`
      )
  )

  for (const customer of customersToUpdate) {
    const newAge = Number(customer.age) + 1

    yield* query((client) =>
      client
        .update(customers)
        .set({
          age: newAge,
        })
        .where(eq(customers.id, customer.id))
    )
  }
  return customersToUpdate.length
})

export { updateCustomerAge }
