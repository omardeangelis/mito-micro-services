import { relations, sql } from "drizzle-orm"
import {
  pgTableCreator,
  timestamp,
  text,
  boolean,
  index,
  integer,
} from "drizzle-orm/pg-core"
import { chatToOperator } from "./relations/chatToOperator"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const messages = createTable(
  "messages",
  {
    id: integer("id")
      .primaryKey()
      .generatedAlwaysAsIdentity({ startWith: 10000 })
      .notNull(),
    operatorId: integer("operator_id").notNull(),
    chatId: integer("chat_id").notNull(),
    sendDate: timestamp("send_date", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    notifyDate: timestamp("notify_date", { withTimezone: true }),
    content: text("content").notNull(),
  },
  (message) => ({
    chatIdIdx: index("message_chatId_idx").on(message.chatId),
  })
)

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chat, {
    fields: [messages.chatId],
    references: [chat.id],
  }),
}))

export const chat = createTable("chat", {
  id: integer("id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ startWith: 1000 })
    .notNull(),
  createdAt: timestamp("send_date", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  isRead: boolean("is_read"),
})

export const chatRelations = relations(chat, ({ many }) => ({
  messages: many(messages),
  chatToOperator: many(chatToOperator),
}))
