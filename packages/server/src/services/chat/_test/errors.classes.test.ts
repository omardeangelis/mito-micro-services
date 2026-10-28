// @vitest-environment node
import { describe, expect, it } from "vitest"
import { ChatMissing, MessageMissing, NotMessageAuthor } from "../errors"

// AC10: each error builds from the ids the chat services pass

describe("errori della chat: costruzione", () => {
  it("ChatMissing porta l'id della chat", () => {
    const error = new ChatMissing({ chatId: 12 })
    expect(error).toBeInstanceOf(ChatMissing)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ChatMissing")
    expect(error.chatId).toBe(12)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: "ChatMissing", chatId: 12 })
  })

  it("MessageMissing porta l'id del messaggio", () => {
    const error = new MessageMissing({ messageId: 34 })
    expect(error).toBeInstanceOf(MessageMissing)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("MessageMissing")
    expect(error.messageId).toBe(34)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "MessageMissing",
      messageId: 34,
    })
  })

  it("NotMessageAuthor porta l'id del messaggio", () => {
    const error = new NotMessageAuthor({ messageId: 56 })
    expect(error).toBeInstanceOf(NotMessageAuthor)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("NotMessageAuthor")
    expect(error.messageId).toBe(56)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "NotMessageAuthor",
      messageId: 56,
    })
  })
})
