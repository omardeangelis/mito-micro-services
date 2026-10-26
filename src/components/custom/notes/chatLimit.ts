import { MAX_CHAT_LIMIT } from "@mito/domain/constants/chat"

/**
 * The `limit` of the detail's address: how many messages of the customer's
 * chat to show ("Carica altri messaggi" raises it, AC57). Plain digits only,
 * from 1 to `MAX_CHAT_LIMIT`; anything else (absent, repeated, "1e2", "0x10",
 * a number above the most the server returns) is ignored, and the chat starts
 * from its default.
 */
export const parseChatLimit = (
  value: string | string[] | undefined
): number | undefined => {
  if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value)) {
    return undefined
  }
  const limit = Number(value)
  return limit <= MAX_CHAT_LIMIT ? limit : undefined
}
