import { TRPCError } from "@trpc/server"
import { Schema } from "effect"
import { type CustomerMissing } from "../../effect/db"

/** The chat doesn't exist, or it was deleted while the call waited. */
export class ChatMissing extends Schema.TaggedError<ChatMissing>()(
  "ChatMissing",
  { chatId: Schema.Number }
) {}

/**
 * The note doesn't exist any more, or its chat has no customer (any more): the
 * customer may be gone while the deletion waited for its lock.
 */
export class MessageMissing extends Schema.TaggedError<MessageMissing>()(
  "MessageMissing",
  { messageId: Schema.Number }
) {}

/** Only the author of a note deletes it, not even an administrator. */
export class NotMessageAuthor extends Schema.TaggedError<NotMessageAuthor>()(
  "NotMessageAuthor",
  { messageId: Schema.Number }
) {}

/**
 * The `TRPCError` for a chat error, passed to `runTrpc` by the chat
 * procedures. `sendCustomerMessage` fails with `ChatMissing`,
 * `createCustomerChat` with `CustomerMissing` (the customer doesn't exist) and
 * `deleteCustomerMessage` with `MessageMissing` or `NotMessageAuthor`.
 */
export const chatErrorToTrpc = (
  error: ChatMissing | MessageMissing | NotMessageAuthor | CustomerMissing
): TRPCError => {
  switch (error._tag) {
    case "ChatMissing":
      return new TRPCError({ code: "NOT_FOUND", message: "Chat non trovata" })
    case "CustomerMissing":
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Cliente non trovato",
      })
    case "NotMessageAuthor":
      return new TRPCError({
        code: "FORBIDDEN",
        message: "Solo l'autore della nota può eliminarla",
      })
    case "MessageMissing":
      return new TRPCError({ code: "NOT_FOUND", message: "Nota non trovata" })
  }
}
