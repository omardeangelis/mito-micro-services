import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"

type Operator = Awaited<ReturnType<typeof createOperator>>

const isReadOf = async (chatId: number) => {
  const [row] = await testDb
    .select({ isRead: chat.isRead })
    .from(chat)
    .where(eq(chat.id, chatId))
  return row?.isRead
}

const noteOf = async (id: number) => {
  const [row] = await testDb.select().from(messages).where(eq(messages.id, id))
  return row!
}

const chatToOperatorOf = (chatId: number) =>
  testDb
    .select({
      chatId: chatToOperator.chatId,
      operatorId: chatToOperator.operatorId,
    })
    .from(chatToOperator)
    .where(eq(chatToOperator.chatId, chatId))

/** Starts the chat of `customer` as `operator`, then sets it as read. */
const startReadChat = async (operator: Operator, customer: { id: string }) => {
  const { id } = await createTestCaller(operator).chat.createNewCustomerChat({
    customerId: customer.id,
  })
  await testDb.update(chat).set({ isRead: true }).where(eq(chat.id, id))
  return id
}

let a: Operator
let b: Operator
let c: Operator
let chatId: number
let controlChatId: number

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  a = await createOperator()
  b = await createOperator()
  c = await createOperator()
  chatId = await startReadChat(a, await createCustomer({ operatorId: a.id }))
  // The chat of another customer, to see that it does not change
  controlChatId = await startReadChat(
    b,
    await createCustomer({ operatorId: b.id })
  )
})

describe("chat.insertMessage", () => {
  it("scrivere una nota risponde la riga salvata, segna la chat come non letta e lascia le altre come sono", async () => {
    const response = await createTestCaller(a).chat.insertMessage({
      chatId,
      content: "Richiamare domani",
    })

    const saved = await noteOf(response!.id)
    expect(response).toEqual(saved)
    expect(response?.operatorId).toBe(a.id)
    expect(response?.chatId).toBe(chatId)
    expect(response?.notifyDate).toBeNull()
    expect(response?.content).toBe("Richiamare domani")

    expect(await isReadOf(chatId)).toBe(false)
    expect(await isReadOf(controlChatId)).toBe(true)
    expect(await chatToOperatorOf(chatId)).toEqual([
      { chatId, operatorId: a.id },
    ])
  })

  it("chat.insertMessage con l'operatorId di un altro nell'input salva la nota con l'operatorId dell'operatore della sessione e segna la chat come non letta", async () => {
    // The type does not allow an operatorId: the router must ignore it
    const input = {
      chatId,
      content: "Nota con un altro operatore",
      operatorId: b.id,
    } as unknown as { chatId: number; content: string }

    const response = await createTestCaller(a).chat.insertMessage(input)

    const saved = await noteOf(response!.id)
    expect(response).toEqual(saved)
    expect(saved.operatorId).toBe(a.id)
    expect(saved.chatId).toBe(chatId)
    expect(await isReadOf(chatId)).toBe(false)
  })

  it("un operatore scrive anche nella chat del cliente di un collega: la nota ha il suo operatorId e la chat diventa non letta", async () => {
    const response = await createTestCaller(c).chat.insertMessage({
      chatId,
      content: "Nota dal collega",
    })

    const saved = await noteOf(response!.id)
    expect(response).toEqual(saved)
    expect(saved.operatorId).toBe(c.id)
    expect(saved.chatId).toBe(chatId)
    expect(await isReadOf(chatId)).toBe(false)
  })
})
