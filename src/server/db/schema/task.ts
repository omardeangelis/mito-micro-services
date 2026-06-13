import { relations, sql } from "drizzle-orm"
import {
  pgTableCreator,
  timestamp,
  integer,
  pgEnum,
  varchar,
  boolean,
} from "drizzle-orm/pg-core"
import { customers } from "./customers"
import { operators } from "./operators"

export const taskStatus = [
  "chiamare",
  "non interessato",
  "app.to",
  "caricato",
  "richiamare",
  "erogata",
  "nessuno",
  "followup",
] as const

const taskStatusEnum = pgEnum("task_status", taskStatus)

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const alert = createTable("alert", {
  id: integer("id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ startWith: 1000 })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => new Date()),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  taskId: integer("task_id").notNull(),
  message: varchar("message"),
  isResolved: boolean("is_resolved").default(false).notNull(),
})

export const task = createTable("task", {
  id: integer("id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ startWith: 1000 })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(new Date())
    .notNull()
    .$onUpdate(() => new Date()),
  state: taskStatusEnum("state").default("nessuno"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  customerId: varchar("customer_id").references(() => customers.id),
  operatorId: integer("operator_id").references(() => operators.id),
  alertId: integer("alert_id").references(() => alert.id),
  priority: integer("priority").default(0),
  customPriority: boolean("custom_priority").default(false),
  isActive: boolean("is_active").default(false).notNull(),
})

export const alertsRelations = relations(alert, ({ one }) => ({
  task: one(task, {
    fields: [alert.taskId],
    references: [task.id],
  }),
}))

export const taskRelations = relations(task, ({ one }) => ({
  customer: one(customers, {
    fields: [task.customerId],
    references: [customers.id],
  }),
  operator: one(operators, {
    fields: [task.operatorId],
    references: [operators.id],
  }),
  alert: one(alert, {
    fields: [task.id],
    references: [alert.id],
  }),
}))
