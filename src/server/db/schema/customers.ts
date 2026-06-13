import { relations, sql } from "drizzle-orm"
import {
  pgTableCreator,
  timestamp,
  varchar,
  char,
  decimal,
  integer,
  smallint,
  pgEnum,
} from "drizzle-orm/pg-core"
import { customerToPratica } from "./relations/customerToPratica"
import { chat } from "./chat"
import { task } from "./task"
import { operators } from "./operators"
import { nanoid } from "nanoid"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const blackListStatus = ["blacklisted", "whitelisted", "review"] as const
export const blackListEnum = pgEnum("blacklist_status", blackListStatus)

export const sourceValues = [
  "spontaneo",
  "passaparola",
  "inbound",
  "outbound",
  "call center",
  "post vendita",
  "digital",
  "banca",
  "mito",
  "wave",
  "internal",
] as const
export const sourceEnum = pgEnum("source_value", sourceValues)

export const customers = createTable("customers", {
  id: varchar("id").primaryKey().notNull().default(nanoid()),
  fullName: varchar("fullname", { length: 255 }),
  name: varchar("name", { length: 255 }),
  sede: varchar("sede", { length: 255 }),
  surname: varchar("surname", { length: 255 }),
  fiscalCode: char("fiscal_code", { length: 16 }),
  vatCode: varchar("vat_code", { length: 255 }),
  email: varchar("email", { length: 255 }),
  birthdayDate: timestamp("birthday_date", {
    withTimezone: true,
    mode: "date",
  }),
  age: smallint("age"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  address: varchar("address", { length: 255 }),
  cap: varchar("cap", { length: 5 }),
  blackListStatus: blackListEnum("blacklist_status")
    .notNull()
    .default("whitelisted"),
  comune: varchar("comune", { length: 100 }),
  provincia: varchar("provincia", { length: 100 }),
  tempID: varchar("temp_id", { length: 255 }).unique().notNull(),
  fileName: varchar("file_name", { length: 255 }),
  uniqueHash: varchar("unique_hash", { length: 255 }).notNull().unique(),
  reddito: decimal("reddito"),
  occupazione: varchar("occupazione", { length: 255 }),
  ambitoLavorativo: varchar("ambito_lavorativo", { length: 255 }),
  tipoContratto: varchar("tipo_contratto", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .default(new Date())
    .$onUpdate(() => new Date())
    .notNull(),
  lastImportUpdate: timestamp("last_import_update", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  chatId: integer("chat_id").references(() => chat.id),
  operatorId: smallint("operator_id").references(() => operators.id),
  source: sourceEnum("source").notNull(),
})

export const customersRelations = relations(customers, ({ one, many }) => ({
  customerToPratica: many(customerToPratica),
  tasks: many(task),
  chat: one(chat, {
    fields: [customers.id],
    references: [chat.id],
  }),
  operator: one(operators, {
    fields: [customers.operatorId],
    references: [operators.id],
  }),
}))
