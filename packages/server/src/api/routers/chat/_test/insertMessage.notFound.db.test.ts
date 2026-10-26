import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { messages } from "@mito/db/schema/chat"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createOperator } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("chat.insertMessage su una chat che non esiste", () => {
  it("risponde NOT_FOUND con Chat non trovata e non salva né la nota né la riga dell'operatore", async () => {
    const operator = await createOperator()

    await expect(
      createTestCaller(operator).chat.insertMessage({
        chatId: 999999,
        content: "Nota",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Chat non trovata" })

    expect(await testDb.select().from(messages)).toEqual([])
    expect(await testDb.select().from(chatToOperator)).toEqual([])
  })
})
