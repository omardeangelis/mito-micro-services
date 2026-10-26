import { relations } from "drizzle-orm"
import {
  index,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { users } from "./users"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

// The tables of better-auth (spec auth-better-auth, D4), next to NextAuth's
// account, session and verificationToken, which stay as they are until the
// switch has reached production: reverting the code brings NextAuth back with
// its rows. The user is NextAuth's, with the columns better-auth needs

const timestamps = {
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
}

export const authSessions = createTable(
  "auth_session",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    token: varchar("token", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (session) => ({
    tokenIdx: uniqueIndex("auth_session_token_idx").on(session.token),
    userIdIdx: index("auth_session_user_id_idx").on(session.userId),
  })
)

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}))

/**
 * One row per provider account of a user. The token columns are there because
 * better-auth's model has them, and stay empty: the provider's tokens are
 * never kept (AC31).
 */
export const authAccounts = createTable(
  "auth_account",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (account) => ({
    providerAccountIdx: uniqueIndex("auth_account_provider_account_idx").on(
      account.providerId,
      account.accountId
    ),
    userIdIdx: index("auth_account_user_id_idx").on(account.userId),
  })
)

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}))

/** The links of the email login, used once and then deleted. */
export const authVerifications = createTable(
  "auth_verification",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (verification) => ({
    identifierIdx: index("auth_verification_identifier_idx").on(
      verification.identifier
    ),
  })
)
