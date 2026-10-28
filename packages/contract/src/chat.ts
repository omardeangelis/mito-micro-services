import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import {
  ChatMissing,
  CustomerNotFound,
  MessageMissing,
  NotMessageAuthor,
} from "./errors"
import { Authenticated } from "./middleware"
import { IntegerId } from "./schemas"

/**
 * `MAX_CHAT_LIMIT` of @mito/domain/constants/chat, written again since the
 * contract imports only effect (H5): the most notes one read returns
 */
export const MAX_CHAT_LIMIT = 500

/** A note of a chat, as the chat shows it */
export const ChatMessage = Schema.Struct({
  id: Schema.Number,
  operatorId: Schema.Number,
  sendDate: Schema.Date,
  content: Schema.String,
})
export type ChatMessage = typeof ChatMessage.Type

/** A note as it is saved, with its chat and the date of its notification */
export const SavedMessage = Schema.Struct({
  ...ChatMessage.fields,
  chatId: Schema.Number,
  notifyDate: Schema.NullOr(Schema.Date),
})

/**
 * The group `chat` (3.4 of brain/chore/migrazione-frontend-react.md): the
 * procedures of the tRPC router `chat`, each with its name (H8).
 *
 * | procedure             | method and path              |
 * | --------------------- | ---------------------------- |
 * | getChatMessagesById   | GET /chat/:id                |
 * | insertMessage         | POST /chat/:id/messages      |
 * | createNewCustomerChat | POST /chat                   |
 * | deleteMessage         | DELETE /chat/messages/:id    |
 */
export class ChatGroup extends HttpApiGroup.make("chat")
  .add(
    HttpApiEndpoint.get("getChatMessagesById", "/chat/:id", {
      params: { id: IntegerId },
      query: {
        // The last `limit` notes: 5 when the address has none
        limit: Schema.optional(
          Schema.FiniteFromString.check(
            Schema.isInt(),
            Schema.isBetween({ minimum: 1, maximum: MAX_CHAT_LIMIT })
          )
        ),
      },
      // The notes oldest first, and how many the chat has
      success: Schema.Struct({
        messages: Schema.Array(ChatMessage),
        total: Schema.Number,
      }),
    })
  )
  .add(
    HttpApiEndpoint.post("insertMessage", "/chat/:id/messages", {
      params: { id: IntegerId },
      payload: Schema.Struct({ content: Schema.String }),
      // The note saved, null as the procedure's `undefined`
      success: Schema.NullOr(SavedMessage),
      error: ChatMissing,
    })
  )
  .add(
    HttpApiEndpoint.post("createNewCustomerChat", "/chat", {
      payload: Schema.Struct({ customerId: Schema.String }),
      // The customer's chat: the new one, or the one it already had
      success: Schema.Struct({ id: Schema.Number }),
      error: CustomerNotFound,
    })
  )
  .add(
    HttpApiEndpoint.delete("deleteMessage", "/chat/messages/:id", {
      params: { id: IntegerId },
      // Only the author deletes a note; the last one takes the chat with it
      error: [MessageMissing, NotMessageAuthor],
    })
  )
  .middleware(Authenticated) {}
