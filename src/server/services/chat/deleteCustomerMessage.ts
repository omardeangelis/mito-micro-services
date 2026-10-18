import "server-only"
import { Data, Effect } from "effect"
import { and, count, eq } from "drizzle-orm"
import { chat, messages } from "@/server/db/schema/chat"
import { customers } from "@/server/db/schema/customers"
import { chatToOperator } from "@/server/db/schema/relations/chatToOperator"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
} from "@/server/effect/db"

/** The note doesn't exist any more, or its chat has no customer. */
export class MessageMissing extends Data.TaggedError("MessageMissing")<{
  readonly messageId: number
}> {}

/** Only the author of a note deletes it, an administrator too. */
export class NotMessageAuthor extends Data.TaggedError("NotMessageAuthor")<{
  readonly messageId: number
}> {}

/**
 * Deletes a note of a customer's chat. The last note takes the chat with it:
 * the customer is left without one, as before "Avvia una chat". The customer
 * is locked before any write, as "Avvia una chat" does, so the two never
 * cross: a chat just returned to a colleague is not deleted under them.
 */
export const deleteCustomerMessage = ({
  messageId,
  operator,
}: {
  messageId: number
  operator: { id: number }
}): Effect.Effect<
  void,
  MessageMissing | NotMessageAuthor | CustomerMissing | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const [note] = yield* query((client) =>
        client
          .select({
            chatId: messages.chatId,
            operatorId: messages.operatorId,
            customerId: customers.id,
          })
          .from(messages)
          .innerJoin(customers, eq(customers.chatId, messages.chatId))
          .where(eq(messages.id, messageId))
      )
      if (!note) return yield* new MessageMissing({ messageId })
      if (note.operatorId !== operator.id) {
        return yield* new NotMessageAuthor({ messageId })
      }

      yield* lockCustomer(note.customerId)
      // Under the lock: the note may have gone with its chat in the meantime
      const deleted = yield* query((client) =>
        client
          .delete(messages)
          .where(
            and(eq(messages.id, messageId), eq(messages.chatId, note.chatId))
          )
          .returning({ id: messages.id })
      )
      if (deleted.length === 0) return yield* new MessageMissing({ messageId })

      const [left] = yield* query((client) =>
        client
          .select({ total: count() })
          .from(messages)
          .where(eq(messages.chatId, note.chatId))
      )
      if ((left?.total ?? 0) > 0) return

      yield* query((client) =>
        client
          .delete(chatToOperator)
          .where(eq(chatToOperator.chatId, note.chatId))
      )
      yield* query((client) =>
        client
          .update(customers)
          .set({ chatId: null, updatedAt: new Date() })
          .where(eq(customers.id, note.customerId))
      )
      yield* query((client) =>
        client.delete(chat).where(eq(chat.id, note.chatId))
      )
    })
  )
