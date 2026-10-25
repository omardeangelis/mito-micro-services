import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
} from "../../effect/db"

/**
 * "Avvia una chat": the customer's chat, created with the operator in it if
 * the customer has none. A customer has at most one chat: a second call (a
 * second click, a page not refreshed yet, a colleague on the same customer)
 * gets the chat already there, so none is left without a customer.
 */
export const createCustomerChat = ({
  customerId,
  operatorId,
}: {
  customerId: string
  operatorId: number
}): Effect.Effect<{ id: number }, CustomerMissing | DbError, Db> =>
  transaction(
    Effect.gen(function* () {
      // Two calls on the same customer wait for each other here
      yield* lockCustomer(customerId)
      const [customer] = yield* query((client) =>
        client
          .select({ chatId: customers.chatId })
          .from(customers)
          .where(eq(customers.id, customerId))
      )
      if (customer?.chatId) return { id: customer.chatId }

      const [created] = yield* query((client) =>
        client.insert(chat).values({ isRead: false }).returning({ id: chat.id })
      )
      const id = created!.id
      yield* query((client) =>
        client
          .update(customers)
          .set({ chatId: id })
          .where(eq(customers.id, customerId))
      )
      yield* query((client) =>
        client.insert(chatToOperator).values({ chatId: id, operatorId })
      )
      return { id }
    })
  )
