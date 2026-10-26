import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Exit } from "effect"
import { eq } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { sendCustomerMessage } from "../sendCustomerMessage"
import { createTestCaller } from "@/test/caller"
import { failureTag, runServer } from "@/test/effect"
import { createCustomer, createOperator } from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// Sending a note against the other writers of a customer's chat, on a real
// Postgres (PGlite has one connection and can't show it): the send locks the
// customer before it writes, as "Avvia una chat" and "Elimina nota" do (AC6).

const send = (chatId: number, operator: { id: number }, content: string) =>
  runServer(sendCustomerMessage({ chatId, content, operatorId: operator.id }))

const notesOf = (chatId: number) =>
  pgDb
    .select({ operatorId: messages.operatorId, content: messages.content })
    .from(messages)
    .where(eq(messages.chatId, chatId))

const operatorsOf = (chatId: number) =>
  pgDb
    .select({ operatorId: chatToOperator.operatorId })
    .from(chatToOperator)
    .where(eq(chatToOperator.chatId, chatId))

/** A customer of `operator` with the chat `operator` started. */
async function seedChat(operator: { id: number; userId: string }) {
  const customer = await createCustomer({ operatorId: operator.id })
  const { id: chatId } = await createTestCaller(
    operator
  ).chat.createNewCustomerChat({ customerId: customer.id })
  return { customer, chatId }
}

describe.skipIf(!hasTestDatabase)(
  "sendCustomerMessage e il lock del cliente su Postgres vero",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    it("mentre un'altra transazione tiene il lock del cliente, l'invio di chi è già nella chat aspetta", async () => {
      const operator = await createOperator()
      const { customer, chatId } = await seedChat(operator)
      const held = await holdCustomerLock(customer.id)

      const sending = send(chatId, operator, "Nota")
      await waitUntilBlocked(1)
      expect(await notesOf(chatId)).toEqual([])

      await held.release()
      expect(Exit.isSuccess(await sending)).toBe(true)
      expect(await notesOf(chatId)).toEqual([
        { operatorId: operator.id, content: "Nota" },
      ])
    })

    it("due invii insieme di un operatore che non è nella chat salvano tutte e due le note e una sola riga dell'operatore", async () => {
      const author = await createOperator()
      const colleague = await createOperator()
      const { customer, chatId } = await seedChat(author)
      const held = await holdCustomerLock(customer.id)

      const first = send(chatId, colleague, "Prima")
      const second = send(chatId, colleague, "Seconda")
      await waitUntilBlocked(2)
      await held.release()

      expect(Exit.isSuccess(await first)).toBe(true)
      expect(Exit.isSuccess(await second)).toBe(true)
      expect(
        (await notesOf(chatId)).map(({ content }) => content).sort()
      ).toEqual(["Prima", "Seconda"])
      expect(
        (await operatorsOf(chatId)).filter(
          ({ operatorId }) => operatorId === colleague.id
        )
      ).toHaveLength(1)
    })

    it("se la chat sparisce mentre l'invio aspetta il lock, fallisce con ChatMissing e non salva niente", async () => {
      const operator = await createOperator()
      const { customer, chatId } = await seedChat(operator)
      await pgDb
        .insert(messages)
        .values({ chatId, operatorId: operator.id, content: "L'ultima nota" })
      const held = await holdCustomerLock(customer.id)

      const sending = send(chatId, operator, "Nota inviata")
      await waitUntilBlocked(1)
      // A colleague deletes the last note, and the chat goes with it
      await held.db.delete(messages).where(eq(messages.chatId, chatId))
      await held.db
        .delete(chatToOperator)
        .where(eq(chatToOperator.chatId, chatId))
      await held.db
        .update(customers)
        .set({ chatId: null })
        .where(eq(customers.id, customer.id))
      await held.db.delete(chat).where(eq(chat.id, chatId))
      await held.release()

      expect(failureTag(await sending)).toBe("ChatMissing")
      expect(await notesOf(chatId)).toEqual([])
      expect(await pgDb.select().from(chat).where(eq(chat.id, chatId))).toEqual(
        []
      )
      expect(await operatorsOf(chatId)).toEqual([])
    })
  }
)
