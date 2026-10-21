import { relations, sql } from "drizzle-orm"
import {
  char,
  pgTableCreator,
  integer,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"
import { practices } from "./pratiche"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const products = createTable("products", {
  id: integer("id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ startWith: 1000 })
    .notNull(),
  productCode: char("product_code", { length: 2 }).notNull(),
  productLabel: varchar("product_label"),
  productType: varchar("product_type"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
    () => new Date()
  ),
})

export const productsRelations = relations(products, ({ many }) => ({
  practices: many(practices),
}))
