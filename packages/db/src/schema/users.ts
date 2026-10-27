import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgTableCreator,
  primaryKey,
  text,
  timestamp,
  varchar,
  pgEnum,
} from "drizzle-orm/pg-core"
import { type AdapterAccount } from "next-auth/adapters"
import { operators } from "./operators"

export const userRoles = pgEnum("UserRole", ["ADMIN", "OPERATORE"])

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const users = createTable("user", {
  id: varchar("id", { length: 255 }).notNull().primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("emailVerified", {
    mode: "date",
  }).default(sql`CURRENT_TIMESTAMP`),
  role: userRoles("role").notNull().default("ADMIN"),
  image: varchar("image", { length: 255 }),
  preferences: text("preferences"),
  // Chi ha disattivato l'utente e quando: null = attivo (gestione-operatori).
  disabledAt: timestamp("disabled_at", { mode: "date", withTimezone: true }),
  disabledBy: integer("disabled_by").references(() => operators.id),
  // The columns better-auth needs (spec auth-better-auth, D4): its
  // `emailVerified` is a boolean, and it sets both times on every write.
  // Every user from before it counts as confirmed (migration auth_data)
  emailConfirmed: boolean("email_confirmed").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  operator: one(operators, {
    fields: [users.id],
    references: [operators.userId],
  }),
}))

export const accounts = createTable(
  "account",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 255 })
      .$type<AdapterAccount["type"]>()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_userId_idx").on(account.userId),
  })
)

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const sessions = createTable(
  "session",
  {
    sessionToken: varchar("sessionToken", { length: 255 })
      .notNull()
      .primaryKey(),
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => users.id),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  })
)

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const verificationTokens = createTable(
  "verificationToken",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)
