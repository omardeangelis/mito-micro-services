import { pgTable, primaryKey, integer, smallint } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { operators } from "../operators"
import { chat } from "../chat"

export const chatToOperator = pgTable(
  "chat_to_operator",
  {
    chatId: integer("chat_id")
      .notNull()
      .references(() => chat.id),
    operatorId: smallint("operator_id")
      .notNull()
      .references(() => operators.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.operatorId] }),
  })
)

export const chatToOperatorRelations = relations(chatToOperator, ({ one }) => ({
  operator: one(operators, {
    fields: [chatToOperator.chatId],
    references: [operators.id],
  }),
  chat: one(chat, {
    fields: [chatToOperator.operatorId],
    references: [chat.id],
  }),
}))
