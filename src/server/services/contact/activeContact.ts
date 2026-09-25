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
} from "@/server/effect/db"

/**
 * Gives the customer a new active contact: deactivates all its active tasks,
 * then inserts one with `values`. Runs in the transaction that locked
 * `customer` (`lockCustomer`). Every path that creates a contact goes through
 * here; the fields are the caller's call.
 *
 * `previous` is the most recent of the deactivated tasks, as the UI shows it
 * (`task.getActiveTask`), or null.
 */
export const replaceActiveContact = ({
  customer,
  values,
}: {
  customer: LockedCustomer
  values: Omit<typeof task.$inferInsert, "id" | "customerId" | "isActive">
}): Effect.Effect<
  { created: Task & { customerId: string }; previous: Task | null },
  DbError,
  Db
> =>
  Effect.gen(function* () {
    const isActiveOfCustomer = and(
      eq(task.customerId, customer.id),
      eq(task.isActive, true)
    )

    // Ordered before the update, which rewrites updated_at
    const [mostRecent] = yield* query((client) =>
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
        .values({ ...values, customerId: customer.id, isActive: true })
        .returning()
    )

    return {
      created: { ...created!, customerId: customer.id },
      previous: deactivated.find((row) => row.id === mostRecent?.id) ?? null,
    }
  })
