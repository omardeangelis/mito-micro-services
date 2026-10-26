import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import {
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
} from "../../effect/db"
import { ChatMissing } from "./errors"

/**
 * "Send a note": saves the operator's note in the chat and marks the chat as
 * unread. The operator joins the chat first, unless already in it. The
 * customer of the chat is locked before any write, then the chat rows are
 * written, as `createCustomerChat` and `deleteCustomerMessage` do, so the
 * three never cross. A chat no customer points to has nothing to lock. The
 * chat is read after the lock: one deleted with its last note while this
 * send waited is seen as gone, and nothing is saved in it.
 */
export const sendCustomerMessage = ({
  chatId,
  content,
  operatorId,
}: {
  chatId: number
  content: string
  operatorId: number
}): Effect.Effect<
  typeof messages.$inferSelect | undefined,
  ChatMissing | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const [customer] = yield* query((client) =>
        client
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.chatId, chatId))
      )
      if (customer) {
        yield* lockCustomer(customer.id).pipe(
          // The customer was deleted while this send waited: the send fails
          // as for a missing chat, and saves nothing
          Effect.catchTag("CustomerMissing", () =>
            Effect.fail(new ChatMissing({ chatId }))
          )
        )
      }

      // Under the lock: the chat may have gone with its last note meanwhile
      const [found] = yield* query((client) =>
        client.select({ id: chat.id }).from(chat).where(eq(chat.id, chatId))
      )
      if (!found) return yield* new ChatMissing({ chatId })

      yield* query((client) =>
        client
          .insert(chatToOperator)
          .values({ chatId, operatorId })
          .onConflictDoNothing()
      )
      const inserted = yield* query((client) =>
        client
          .insert(messages)
          .values({ chatId, content, operatorId })
          .returning()
      )
      yield* query((client) =>
        client.update(chat).set({ isRead: false }).where(eq(chat.id, chatId))
      )
      return inserted[0]
    })
  )
