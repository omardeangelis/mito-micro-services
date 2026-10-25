import { TRPCError } from "@trpc/server"
import { Data } from "effect"

/** The chat doesn't exist, or it was deleted while the call waited. */
export class ChatMissing extends Data.TaggedError("ChatMissing")<{
  readonly chatId: number
}> {}

/**
 * The `TRPCError` for a chat error, passed to `runTrpc` by the chat
 * procedures.
 */
export const chatErrorToTrpc = (error: ChatMissing): TRPCError => {
  switch (error._tag) {
    case "ChatMissing":
      return new TRPCError({ code: "NOT_FOUND", message: "Chat non trovata" })
  }
}
