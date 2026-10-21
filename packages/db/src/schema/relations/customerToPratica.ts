import { pgTable, primaryKey, pgEnum, varchar } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { practices } from "../pratiche"
import { customers } from "../customers"

export const customerRoleEnum = [
  "Intestatario",
  "Coobbligato",
  "Garante",
] as const
export const customerRole = pgEnum("CustomerRole", customerRoleEnum)

export const getRandomCustomerRole = (): (typeof customerRoleEnum)[number] => {
  const indiceCasuale = Math.floor(Math.random() * customerRoleEnum.length)
  return customerRoleEnum[indiceCasuale] ?? "Intestatario"
}

export type CustomerRole = (typeof customerRoleEnum)[number]

export const customerToPratica = pgTable(
  "customers_to_pratiche",
  {
    customerId: varchar("customer_id")
      .notNull()
      .references(() => customers.id),
    praticaId: varchar("pratica_id")
      .notNull()
      .references(() => practices.praticaId),
    customerRole: customerRole("customer_role"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.customerId, t.praticaId] }),
  })
)

export const praticheToCustomersRelations = relations(
  customerToPratica,
  ({ one }) => ({
    pratica: one(practices, {
      fields: [customerToPratica.praticaId],
      references: [practices.praticaId],
    }),
    customer: one(customers, {
      fields: [customerToPratica.customerId],
      references: [customers.id],
    }),
  })
)
