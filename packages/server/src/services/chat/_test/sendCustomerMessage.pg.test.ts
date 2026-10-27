import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { eq } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { sendCustomerMessage } from "../sendCustomerMessage"
import { createTestCaller } from "@/test/caller"
import { failureTag, provideServer } from "@/test/effect"
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
  sendCustomerMessage({ chatId, content, operatorId: operator.id }).pipe(
    provideServer,
    Effect.exit
  )

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

    it.effect(
      "mentre un'altra transazione tiene il lock del cliente, l'invio di chi è già nella chat aspetta",
      () =>
        Effect.gen(function* () {
          const operator = yield* Effect.promise(() => createOperator())
          const { customer, chatId } = yield* Effect.promise(() =>
            seedChat(operator)
          )
          const held = yield* Effect.promise(() =>
            holdCustomerLock(customer.id)
          )

          const sending = yield* send(chatId, operator, "Nota").pipe(
            Effect.forkChild
          )
          yield* Effect.promise(() => waitUntilBlocked(1))
          expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([])

          yield* Effect.promise(() => held.release())
          expect(Exit.isSuccess(yield* Fiber.join(sending))).toBe(true)
          expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([
            { operatorId: operator.id, content: "Nota" },
          ])
        })
    )

    it.effect(
      "due invii insieme di un operatore che non è nella chat salvano tutte e due le note e una sola riga dell'operatore",
      () =>
        Effect.gen(function* () {
          const author = yield* Effect.promise(() => createOperator())
          const colleague = yield* Effect.promise(() => createOperator())
          const { customer, chatId } = yield* Effect.promise(() =>
            seedChat(author)
          )
          const held = yield* Effect.promise(() =>
            holdCustomerLock(customer.id)
          )

          const first = yield* send(chatId, colleague, "Prima").pipe(
            Effect.forkChild
          )
          const second = yield* send(chatId, colleague, "Seconda").pipe(
            Effect.forkChild
          )
          yield* Effect.promise(() => waitUntilBlocked(2))
          yield* Effect.promise(() => held.release())

          expect(Exit.isSuccess(yield* Fiber.join(first))).toBe(true)
          expect(Exit.isSuccess(yield* Fiber.join(second))).toBe(true)
          expect(
            (yield* Effect.promise(() => notesOf(chatId)))
              .map(({ content }) => content)
              .sort()
          ).toEqual(["Prima", "Seconda"])
          expect(
            (yield* Effect.promise(() => operatorsOf(chatId))).filter(
              ({ operatorId }) => operatorId === colleague.id
            )
          ).toHaveLength(1)
        })
    )

    it.effect(
      "se la chat sparisce mentre l'invio aspetta il lock, fallisce con ChatMissing e non salva niente",
      () =>
        Effect.gen(function* () {
          const operator = yield* Effect.promise(() => createOperator())
          const { customer, chatId } = yield* Effect.promise(() =>
            seedChat(operator)
          )
          yield* Effect.promise(() =>
            pgDb.insert(messages).values({
              chatId,
              operatorId: operator.id,
              content: "L'ultima nota",
            })
          )
          const held = yield* Effect.promise(() =>
            holdCustomerLock(customer.id)
          )

          const sending = yield* send(chatId, operator, "Nota inviata").pipe(
            Effect.forkChild
          )
          yield* Effect.promise(() => waitUntilBlocked(1))
          // A colleague deletes the last note, and the chat goes with it
          yield* Effect.promise(() =>
            held.db.delete(messages).where(eq(messages.chatId, chatId))
          )
          yield* Effect.promise(() =>
            held.db
              .delete(chatToOperator)
              .where(eq(chatToOperator.chatId, chatId))
          )
          yield* Effect.promise(() =>
            held.db
              .update(customers)
              .set({ chatId: null })
              .where(eq(customers.id, customer.id))
          )
          yield* Effect.promise(() =>
            held.db.delete(chat).where(eq(chat.id, chatId))
          )
          yield* Effect.promise(() => held.release())

          expect(failureTag(yield* Fiber.join(sending))).toBe("ChatMissing")
          expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([])
          expect(
            yield* Effect.promise(() =>
              pgDb.select().from(chat).where(eq(chat.id, chatId))
            )
          ).toEqual([])
          expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([])
        })
    )
  }
)
