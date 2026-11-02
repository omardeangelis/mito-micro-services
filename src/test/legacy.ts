import { sql } from "drizzle-orm"
import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { operators } from "@mito/db/schema/operators"
import { testDb } from "@/test/db"

// `alert` and `task_event_log` as they were before the registry of the calls
// (`resolved_at`, `resolution`, `outcome`, `origin`, `request_id`). A test that
// seeds or reads them on a database migrated to an old tag goes through these:
// Drizzle lists every column of the current schema in its queries, and the old
// database doesn't have the new ones.

export const legacyAlert = pgTable("mito-deutsche_alert", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  taskId: integer("task_id").notNull(),
  message: varchar("message"),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedBy: integer("resolved_by").references(() => operators.id),
})

type LegacyState = typeof task.$inferSelect.state

export const legacyTaskEventLog = pgTable("mito-deutsche_task_event_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  customerId: varchar("customer_id").notNull(),
  taskId: integer("task_id"),
  alertId: integer("alert_id"),
  actorOperatorId: integer("actor_operator_id").notNull(),
  action: varchar("action")
    .notNull()
    .$type<"state_change" | "operator_reassign" | "alert_resolved">(),
  source: varchar("source").notNull().$type<"detail" | "list">(),
  fromState: varchar("from_state").$type<NonNullable<LegacyState>>(),
  toState: varchar("to_state").$type<NonNullable<LegacyState>>(),
  fromOperatorId: integer("from_operator_id"),
  toOperatorId: integer("to_operator_id"),
})

/** `createAlert` of src/test/factories.ts, on the old `alert` table. */
export async function createLegacyAlert(
  values: Omit<Partial<typeof legacyAlert.$inferInsert>, "taskId"> & {
    taskId: number
    deadline: Date
  }
) {
  const [created] = await testDb.insert(legacyAlert).values(values).returning()
  await testDb
    .update(task)
    .set({ alertId: created!.id })
    .where(eq(task.id, values.taskId))
  return created!
}
