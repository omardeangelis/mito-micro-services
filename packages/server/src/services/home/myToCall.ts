import { Effect } from "effect"
import { count, eq } from "drizzle-orm"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { type Actor } from "@mito/domain/contact/permissions"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import { type Db, type DbError, query } from "../../effect/db"
import { buildContactsWhere, openAlertOf } from "../contact/getContacts"

/**
 * The contacts of the actor in Da chiamare and Non risponde (AC9): the `where`
 * and the joins of `getContacts`, so the number is the `total` the list shows
 * with the same filters (AC10).
 */
export const countMyToCall = Effect.fn("home.countMyToCall")(function* ({
  actor,
}: {
  actor: Actor
}): Effect.fn.Return<{ total: number }, DbError, Db> {
  const filters = getContactsInput.parse({
    onlyMe: true,
    states: ["chiamare", "non risponde"],
  })
  const [row] = yield* query((client) =>
    client
      .select({ total: count() })
      .from(task)
      .innerJoin(customers, eq(customers.id, task.customerId))
      .leftJoin(operators, eq(operators.id, task.operatorId))
      .leftJoin(alert, openAlertOf)
      .where(buildContactsWhere(filters, actor))
  )
  return { total: row?.total ?? 0 }
})
