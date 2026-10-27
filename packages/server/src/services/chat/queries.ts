import { Effect } from "effect"
import { count, desc, eq } from "drizzle-orm"
import { messages } from "@mito/db/schema/chat"
import { query } from "../../effect/db"

/**
 * The last `limit` notes of the chat, oldest first, and how many notes it has.
 */
export const listChatMessages = Effect.fn("chat.listChatMessages")(function* ({
  chatId,
  limit,
}: {
  chatId: number
  limit: number
}) {
  const rows = yield* query((client) =>
    client
      .select({
        id: messages.id,
        operatorId: messages.operatorId,
        sendDate: messages.sendDate,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.sendDate))
      .limit(limit)
  )

  const [total] = yield* query((client) =>
    client
      .select({
        total: count(),
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
  )

  return { messages: rows.reverse(), total: total?.total ?? 0 }
})
