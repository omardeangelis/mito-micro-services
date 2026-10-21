import { relations, sql } from "drizzle-orm"
import {
  pgTableCreator,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"
import { practices } from "./pratiche"
import { chatToOperator } from "./relations/chatToOperator"
import { task } from "./task"
import { customers } from "./customers"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const operators = createTable("operator", {
  id: integer("id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ startWith: 1000 })
    .notNull(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  surname: varchar("surname", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
    () => new Date()
  ),
})

export const operatorRelations = relations(operators, ({ many }) => ({
  practices: many(practices),
  customers: many(customers),
  tasks: many(task),
  chatToOperator: many(chatToOperator),
}))
