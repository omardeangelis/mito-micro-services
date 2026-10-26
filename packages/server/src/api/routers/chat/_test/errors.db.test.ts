import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { getTableName } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"
import { beforeNextLockOf } from "@/test/failpoint"

/** A customer with a chat started by `author`, and one note of `author` in it. */
const seedChat = async (author: { id: number; userId: string }) => {
  const customer = await createCustomer()
  const { id: chatId } = await createTestCaller(
    author
  ).chat.createNewCustomerChat({ customerId: customer.id })
  const [note] = await testDb
    .insert(messages)
    .values({ chatId, operatorId: author.id, content: "Nota" })
    .returning({ id: messages.id })
  return { customer, noteId: note!.id }
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("errori di chat.createNewCustomerChat", () => {
  it("per un cliente che non esiste risponde NOT_FOUND con Cliente non trovato", async () => {
    const operator = await createOperator()

    await expect(
      createTestCaller(operator).chat.createNewCustomerChat({
        customerId: "non-esiste",
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Cliente non trovato",
    })
  })
})

describe("errori di chat.deleteMessage", () => {
  it("sulla nota di un collega risponde FORBIDDEN con Solo l'autore della nota può eliminarla", async () => {
    const federica = await createOperator()
    const collega = await createOperator()
    const { noteId } = await seedChat(federica)

    await expect(
      createTestCaller(collega).chat.deleteMessage({ id: noteId })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Solo l'autore della nota può eliminarla",
    })
  })

  it("su una nota che non esiste risponde NOT_FOUND con Nota non trovata", async () => {
    const operator = await createOperator()

    await expect(
      createTestCaller(operator).chat.deleteMessage({ id: 999999 })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Nota non trovata",
    })
  })

  it("su una nota di una chat che nessun cliente punta più risponde NOT_FOUND con Nota non trovata", async () => {
    const federica = await createOperator()
    const [orphan] = await testDb
      .insert(chat)
      .values({ isRead: false })
      .returning({ id: chat.id })
    const [note] = await testDb
      .insert(messages)
      .values({
        chatId: orphan!.id,
        operatorId: federica.id,
        content: "Nota senza cliente",
      })
      .returning({ id: messages.id })

    await expect(
      createTestCaller(federica).chat.deleteMessage({ id: note!.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Nota non trovata",
    })
  })

  it("se il cliente sparisce mentre la cancellazione aspetta il suo lock risponde NOT_FOUND con Nota non trovata", async () => {
    const federica = await createOperator()
    const { customer, noteId } = await seedChat(federica)
    // The customer goes while the deletion waits for its lock. This DELETE
    // runs in the deletion's transaction, so it rolls back with it.
    beforeNextLockOf(
      customers,
      `DELETE FROM "${getTableName(customers)}" WHERE id = '${customer.id}'`
    )

    await expect(
      createTestCaller(federica).chat.deleteMessage({ id: noteId })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Nota non trovata",
    })
  })
})
