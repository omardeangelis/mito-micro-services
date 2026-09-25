import "server-only"
import { Effect } from "effect"
import { and, desc, eq, sql } from "drizzle-orm"
import { type Task } from "@/lib/types/schemas"
import { task } from "@/server/db/schema/task"
import {
  type Db,
  type DbError,
  type LockedCustomer,
  query,
  Tx,
} from "@/server/effect/db"

/**
 * Gives the customer a new active contact: deactivates all its active tasks,
 * then inserts one with `values`. Runs in the transaction that locked
 * `customer` (`lockCustomer`). Every path that creates a contact goes through
 * here; the fields are the caller's call.
 *
 * The new task's `updatedAt` is the start of the transaction, so the tasks
 * written before it in the transaction, the deactivated ones included, are
 * more recent. With `mostRecent` it is later than every task of the customer
 * instead. "Assegna Clienti" (`customer.bulkUpdateCustomers`) picks the most
 * recent task, so each caller keeps the order it had.
 *
 * `previous` is the most recent of the deactivated tasks, as the UI shows it
 * (`task.getActiveTask`), or null.
 */
export const replaceActiveContact = ({
  customer,
  values,
  mostRecent = false,
}: {
  customer: LockedCustomer
  values: Omit<typeof task.$inferInsert, "id" | "customerId" | "isActive">
  mostRecent?: boolean
}): Effect.Effect<
  { created: Task & { customerId: string }; previous: Task | null },
  DbError,
  Db | Tx
> =>
  Effect.gen(function* () {
    // Outside a transaction the update and the insert would commit apart
    yield* Tx
    const isActiveOfCustomer = and(
      eq(task.customerId, customer.id),
      eq(task.isActive, true)
    )

    // Ordered before the update, which rewrites updated_at
    const [mostRecentActive] = yield* query((client) =>
      client
        .select({ id: task.id })
        .from(task)
        .where(isActiveOfCustomer)
        .orderBy(
          desc(sql`GREATEST(${task.updatedAt}, ${task.createdAt})`),
          desc(task.id)
        )
        .limit(1)
    )
    const deactivated = yield* query((client) =>
      client
        .update(task)
        .set({ isActive: false })
        .where(isActiveOfCustomer)
        .returning()
    )
    const [created] = yield* query((client) =>
      client
        .insert(task)
        .values({
          ...values,
          customerId: customer.id,
          isActive: true,
          // The other tasks carry the app's clock, the insert the database's:
          // a millisecond past the latest makes the order certain
          ...(mostRecent && {
            updatedAt: sql`GREATEST(statement_timestamp(), (SELECT max(${task.updatedAt}) FROM ${task} WHERE ${task.customerId} = ${customer.id}) + interval '1 millisecond')`,
          }),
        })
        .returning()
    )

    return {
      created: { ...created!, customerId: customer.id },
      previous:
        deactivated.find((row) => row.id === mostRecentActive?.id) ?? null,
    }
  })
