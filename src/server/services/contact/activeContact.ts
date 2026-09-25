import "server-only"
import { Effect } from "effect"
import { and, desc, eq, sql } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  type Tx,
} from "@/server/effect/db"

type Task = typeof task.$inferSelect

/**
 * Gives the customer a new active contact: deactivates all its active tasks,
 * then inserts one with `values`. Runs in the caller's transaction. Every path
 * that creates a contact goes through here; the fields are the caller's call.
 *
 * `previous` is the most recent of the deactivated tasks, as the UI shows it
 * (`task.getActiveTask`), or null.
 */
export const replaceActiveContact = ({
  customerId,
  values,
}: {
  customerId: string | null
  values: Omit<typeof task.$inferInsert, "id" | "customerId" | "isActive">
}): Effect.Effect<
  { created: Task; previous: Task | null },
  DbError | CustomerMissing,
  Db | Tx
> =>
  Effect.gen(function* () {
    const id = yield* lockCustomer(customerId)
    const isActiveOfCustomer = and(
      eq(task.customerId, id),
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
        .values({ ...values, customerId: id, isActive: true })
        .returning()
    )

    return {
      created: created!,
      previous: deactivated.find((row) => row.id === mostRecent?.id) ?? null,
    }
  })
