import { relations, sql } from "drizzle-orm"
import {
  pgTableCreator,
  timestamp,
  integer,
  pgEnum,
  varchar,
  boolean,
  index,
  uniqueIndex,
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

export const taskStatusEnum = pgEnum("task_status", taskStatus)

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const alert = createTable(
  "alert",
  {
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
    // Operatore che ha risolto l'alert: operatore reale per le azioni manuali,
    // operatore di sistema (vedi src/lib/constants/operator.ts) per il cron.
    resolvedBy: integer("resolved_by").references(() => operators.id),
  },
  (table) => ({
    taskIdIdx: index("alert_task_id_idx").on(table.taskId),
  })
)

export const task = createTable(
  "task",
  {
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
    state: taskStatusEnum("state").default("nessuno"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    customerId: varchar("customer_id").references(() => customers.id),
    operatorId: integer("operator_id").references(() => operators.id),
    alertId: integer("alert_id").references(() => alert.id),
    priority: integer("priority").default(0),
    customPriority: boolean("custom_priority").default(false),
    isActive: boolean("is_active").default(false).notNull(),
  },
  (table) => ({
    // Al massimo un contatto attivo per cliente (AC71). Le task senza cliente
    // non hanno vincoli. Il vincolo si controlla riga per riga: per sostituire
    // il contatto attivo si usa replaceActiveContact, che nella stessa
    // transazione, dopo lockCustomer, disattiva e poi inserisce.
    customerActiveUidx: uniqueIndex("task_customer_active_uidx")
      .on(table.customerId)
      .where(sql`is_active`),
    customerIdIdx: index("task_customer_id_idx").on(table.customerId),
    operatorActiveIdx: index("task_operator_active_idx")
      .on(table.operatorId)
      .where(sql`is_active`),
    priorityActiveIdx: index("task_priority_active_idx")
      .on(table.priority.desc())
      .where(sql`is_active`),
  })
)

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
