import { describe, expect, it } from "vitest"
import { appRouter } from "../../../root"

describe("chat router", () => {
  it("espone esattamente le 4 procedure: le note di una chat, l'invio, l'avvio della chat e l'eliminazione di una nota", () => {
    expect(Object.keys(appRouter._def.record.chat._def.record).sort()).toEqual([
      "createNewCustomerChat",
      "deleteMessage",
      "getChatMessagesById",
      "insertMessage",
    ])
  })
})
