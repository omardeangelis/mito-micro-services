/** The most messages the address can ask for: a bigger number is no request. */
const MAX_CHAT_LIMIT = 10_000

/**
 * The `limit` of the detail's address: how many messages of the customer's
 * chat to show ("Carica altri messaggi" raises it, AC57). Plain digits only,
 * from 1 to `MAX_CHAT_LIMIT`; anything else (absent, repeated, "1e2", "0x10",
 * a number too big for the database) is ignored, and the chat starts from its
 * default.
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
