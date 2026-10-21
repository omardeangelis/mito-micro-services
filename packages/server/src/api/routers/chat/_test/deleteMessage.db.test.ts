import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq, getTableName } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"
import { beforeNextLockOf, failNextUpdateOf } from "@/test/failpoint"

const customerOf = async (customerId: string) => {
  const [row] = await testDb
    .select({ chatId: customers.chatId, updatedAt: customers.updatedAt })
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!
}

const notesOf = (chatId: number) =>
  testDb
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.chatId, chatId))

/** A customer with a chat started by `author` and one note of each operator in `writers`. */
const seedChat = async (
  author: { id: number; userId: string },
  writers: Array<{ id: number }> = [author]
) => {
  const customer = await createCustomer()
  const { id: chatId } = await createTestCaller(
    author
  ).chat.createNewCustomerChat({ customerId: customer.id })
  const notes = await testDb
    .insert(messages)
    .values(
      writers.map((writer, i) => ({
        chatId,
        operatorId: writer.id,
        content: `Nota ${i + 1}`,
      }))
    )
    .returning({ id: messages.id })
  return { customer, chatId, notes: notes.map((n) => n.id) }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("chat.deleteMessage", () => {
  it("l'autore elimina la sua nota e la chat resta con le altre", async () => {
    const federica = await createOperator()
    const { customer, chatId, notes } = await seedChat(federica, [
      federica,
      federica,
    ])

    await createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })

    expect(await notesOf(chatId)).toEqual([{ id: notes[1] }])
    expect((await customerOf(customer.id)).chatId).toBe(chatId)
  })

  it("eliminata l'ultima nota, il cliente resta senza chat e la chat sparisce", async () => {
    const federica = await createOperator()
    const { customer, notes } = await seedChat(federica)
    const before = (await customerOf(customer.id)).updatedAt

    await createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })

    const after = await customerOf(customer.id)
    expect(after.chatId).toBeNull()
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.getTime())
    expect(await testDb.select().from(chat)).toEqual([])
    expect(await testDb.select().from(chatToOperator)).toEqual([])
  })

  it("se un passo dell'eliminazione dell'ultima nota fallisce, non cambia niente", async () => {
    const federica = await createOperator()
    const { customer, chatId, notes } = await seedChat(federica)
    // After the note and the operators of the chat are gone
    await failNextUpdateOf(customers, { id: customer.id })

    await expect(
      createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

    expect(await notesOf(chatId)).toEqual([{ id: notes[0] }])
    expect((await customerOf(customer.id)).chatId).toBe(chatId)
    expect(await testDb.select({ id: chat.id }).from(chat)).toEqual([
      { id: chatId },
    ])
    expect(
      await testDb
        .select({ operatorId: chatToOperator.operatorId })
        .from(chatToOperator)
    ).toEqual([{ operatorId: federica.id }])
  })

  it("un operatore non può eliminare la nota di un collega", async () => {
    const federica = await createOperator()
    const collega = await createOperator()
    const { chatId, notes } = await seedChat(federica, [federica, collega])

    await expect(
      createTestCaller(collega).chat.deleteMessage({ id: notes[0]! })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(await notesOf(chatId)).toEqual(notes.map((id) => ({ id })))
  })

  it("neanche un amministratore può eliminare la nota di un operatore", async () => {
    const federica = await createOperator()
    const admin = await createOperator({ role: "ADMIN" })
    const { chatId, notes } = await seedChat(federica, [federica, admin])

    await expect(
      createTestCaller(admin).chat.deleteMessage({ id: notes[0]! })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(await notesOf(chatId)).toEqual(notes.map((id) => ({ id })))
  })

  it("se la nota sparisce mentre aspetta il cliente dà NOT_FOUND", async () => {
    const federica = await createOperator()
    const collega = await createOperator()
    const { customer, chatId, notes } = await seedChat(federica)
    // While this one waits for the lock, the note goes (a second tab of the
    // author) and a colleague starts a new chat: going on would delete it
    beforeNextLockOf(
      customers,
      `DELETE FROM "${getTableName(messages)}" WHERE id = ${notes[0]};
       DELETE FROM "${getTableName(chatToOperator)}" WHERE chat_id = ${chatId};
       UPDATE "${getTableName(customers)}" SET chat_id = NULL WHERE id = '${customer.id}';
       DELETE FROM "${getTableName(chat)}" WHERE id = ${chatId};
       INSERT INTO "${getTableName(chat)}" (id, is_read) OVERRIDING SYSTEM VALUE VALUES (900, false);
       UPDATE "${getTableName(customers)}" SET chat_id = 900 WHERE id = '${customer.id}';
       INSERT INTO "${getTableName(chatToOperator)}" (chat_id, operator_id) VALUES (900, ${collega.id});`
    )

    // Only the answer: the colleague's writes run in this transaction, and
    // roll back with it
    await expect(
      createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("una nota che non c'è più dà NOT_FOUND", async () => {
    const federica = await createOperator()
    const { notes } = await seedChat(federica, [federica, federica])
    await createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })

    await expect(
      createTestCaller(federica).chat.deleteMessage({ id: notes[0]! })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
