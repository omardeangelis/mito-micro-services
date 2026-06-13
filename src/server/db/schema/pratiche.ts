import { relations, sql } from "drizzle-orm"
import {
  integer,
  pgTableCreator,
  timestamp,
  varchar,
  boolean,
  pgEnum,
  decimal,
  char,
  smallint,
} from "drizzle-orm/pg-core"
import { customerToPratica } from "./relations/customerToPratica"
import { products } from "./products"
import { operators } from "./operators"
import { chat } from "./chat"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)
export const stateEnum = [
  "Liquidata",
  "Rifiutata",
  "Chiusa",
  "Estinta anticipata",
  "Rinunciata",
  "Stornata",
] as const
export const state = pgEnum("State", stateEnum)

export const practices = createTable("practices", {
  id: integer("id").generatedAlwaysAsIdentity({ startWith: 1000 }).notNull(),
  praticaId: varchar("pratica_id", { length: 255 }).notNull().primaryKey(),
  region: varchar("region", { length: 100 }),
  desPuntoVendita: varchar("des_punto_vendita", { length: 255 }),
  desConvenzionato: varchar("des_convenzionato", { length: 255 }),
  subagente: varchar("subagente", { length: 255 }),
  importoFinanziato: decimal("importo_finanziato").notNull(),
  importoErogato: decimal("importo_erogato").notNull(),
  rateTotali: integer("rate_totali").notNull(),
  importoRata: decimal("importo_rata").notNull(),
  ratePagate: integer("rate_pagate").notNull(),
  debitoResiduo: decimal("debito_residuo"),
  dataLiquidazione: timestamp("data_liquidazione", {
    withTimezone: true,
  }).notNull(),
  dataEstinzione: timestamp("data_estinzione", { withTimezone: true }),
  importoRichiesto: decimal("importo_richiesto"),
  paymentMethod: varchar("payment_method", { length: 255 }),
  tassoPratica: decimal("tasso_pratica"),
  state: state("state").notNull(),
  isWave: boolean("is_wave"),
  fileName: varchar("file_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(new Date())
    .$onUpdate(() => new Date())
    .notNull(),
  lastImportUpdate: timestamp("last_import_update", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  productId: char("product_id", { length: 2 }),
  operatorId: smallint("operator_id").references(() => operators.id),
  chatId: integer("chat_id").references(() => chat.id),
})

export const praticheRelations = relations(practices, ({ one, many }) => ({
  customerToPratica: many(customerToPratica),
  product: one(products, {
    fields: [practices.productId],
    references: [products.id],
  }),
  operator: one(operators, {
    fields: [practices.operatorId],
    references: [operators.id],
  }),
  chat: one(chat, {
    fields: [practices.chatId],
    references: [chat.id],
  }),
}))
