import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit } from "effect"
import { asc, eq, getTableName } from "drizzle-orm"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { sendCustomerMessage } from "../sendCustomerMessage"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createCustomer, createOperator } from "@/test/factories"
import {
  beforeNextLockOf,
  failNextInsertInto,
  failNextUpdateOf,
} from "@/test/failpoint"

type Operator = Awaited<ReturnType<typeof createOperator>>

const send = (chatId: number, operator: { id: number }, content = "Nota") =>
  sendCustomerMessage({ chatId, content, operatorId: operator.id }).pipe(
    provideServer,
    Effect.exit
  )

/** The note `send` saved; fails the test if it failed. */
const sent = (...args: Parameters<typeof send>) =>
  Effect.gen(function* () {
    const exit = yield* send(...args)
    if (Exit.isFailure(exit)) throw new Error(Cause.pretty(exit.cause))
    return exit.value!
  })

const notesOf = (chatId: number) =>
  testDb
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.id))

const operatorsOf = async (chatId: number) =>
  (
    await testDb
      .select({ operatorId: chatToOperator.operatorId })
      .from(chatToOperator)
      .where(eq(chatToOperator.chatId, chatId))
  )
    .map(({ operatorId }) => operatorId)
    .sort((x, y) => x - y)

const isReadOf = async (chatId: number) =>
  (await testDb.select().from(chat).where(eq(chat.id, chatId)))[0]?.isRead

/** Starts the chat of a new customer of `operator`, as read. */
const startReadChat = async (operator: Operator) => {
  const customer = await createCustomer({ operatorId: operator.id })
  const { id } = await createTestCaller(operator).chat.createNewCustomerChat({
    customerId: customer.id,
  })
  await testDb.update(chat).set({ isRead: true }).where(eq(chat.id, id))
  return { customer, chatId: id }
}

let a: Operator
let b: Operator
let customer: Awaited<ReturnType<typeof createCustomer>>
let chatId: number
let controlChatId: number

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  a = await createOperator()
  b = await createOperator()
  ;({ customer, chatId } = await startReadChat(a))
  // The chat of another customer, to see that it does not change
  ;({ chatId: controlChatId } = await startReadChat(b))
})

describe("sendCustomerMessage", () => {
  it.effect(
    "un operatore che non è nella chat ci entra, salva la nota con il suo operatorId e la chat diventa non letta",
    () =>
      Effect.gen(function* () {
        const note = yield* sent(chatId, b, "Nota di B")

        expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([note])
        expect(note).toMatchObject({
          chatId,
          operatorId: b.id,
          content: "Nota di B",
          notifyDate: null,
        })
        expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual(
          [a.id, b.id].sort((x, y) => x - y)
        )
        expect(yield* Effect.promise(() => isReadOf(chatId))).toBe(false)

        expect(yield* Effect.promise(() => notesOf(controlChatId))).toEqual([])
        expect(yield* Effect.promise(() => operatorsOf(controlChatId))).toEqual(
          [b.id]
        )
        expect(yield* Effect.promise(() => isReadOf(controlChatId))).toBe(true)
      })
  )

  it.effect(
    "chi ha avviato la chat la scrive senza righe nuove in chat_to_operator",
    () =>
      Effect.gen(function* () {
        const note = yield* sent(chatId, a)

        expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([note])
        expect(note.operatorId).toBe(a.id)
        expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([a.id])
        expect(yield* Effect.promise(() => isReadOf(chatId))).toBe(false)
      })
  )

  it.effect(
    "se la nota non si salva, non resta la riga dell'operatore e la chat resta letta",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => failNextInsertInto(messages))
        expect(failureTag(yield* send(chatId, b))).toBe("DbError")

        expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([])
        expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([a.id])
        expect(yield* Effect.promise(() => isReadOf(chatId))).toBe(true)
      })
  )

  it.effect("se l'operatore non entra nella chat, la nota non si salva", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => failNextInsertInto(chatToOperator))
      expect(failureTag(yield* send(chatId, b))).toBe("DbError")

      expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([])
      expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([a.id])
      expect(yield* Effect.promise(() => isReadOf(chatId))).toBe(true)
    })
  )

  it.effect(
    "se la chat non si segna come non letta, non restano né la nota né la riga dell'operatore",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => failNextUpdateOf(chat, { id: chatId }))
        expect(failureTag(yield* send(chatId, b))).toBe("DbError")

        expect(yield* Effect.promise(() => notesOf(chatId))).toEqual([])
        expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([a.id])
        expect(yield* Effect.promise(() => isReadOf(chatId))).toBe(true)
      })
  )

  it.effect(
    "su una chat che non esiste fallisce con ChatMissing e non salva niente",
    () =>
      Effect.gen(function* () {
        expect(failureTag(yield* send(999999, b))).toBe("ChatMissing")

        expect(yield* Effect.promise(() => notesOf(999999))).toEqual([])
        expect(
          yield* Effect.promise(() => testDb.select().from(chatToOperator))
        ).toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({ chatId: 999999 }),
          ])
        )
        expect(yield* Effect.promise(() => operatorsOf(chatId))).toEqual([a.id])
      })
  )

  it.effect(
    "su una chat a cui nessun cliente punta salva la nota, senza lock",
    () =>
      Effect.gen(function* () {
        const [orphan] = yield* Effect.promise(() =>
          testDb
            .insert(chat)
            .values({ isRead: true })
            .returning({ id: chat.id })
        )

        const note = yield* sent(orphan!.id, b)

        expect(yield* Effect.promise(() => notesOf(orphan!.id))).toEqual([note])
        expect(yield* Effect.promise(() => operatorsOf(orphan!.id))).toEqual([
          b.id,
        ])
        expect(yield* Effect.promise(() => isReadOf(orphan!.id))).toBe(false)
      })
  )

  it.effect(
    "se la chat sparisce mentre l'invio aspetta il cliente, fallisce con ChatMissing e la nota non si salva",
    () =>
      Effect.gen(function* () {
        yield* sent(chatId, a, "L'ultima nota")
        // While this one waits for the lock, the last note is deleted and the
        // chat with it, as "Elimina nota" does
        beforeNextLockOf(
          customers,
          `DELETE FROM "${getTableName(messages)}" WHERE chat_id = ${chatId};
       DELETE FROM "${getTableName(chatToOperator)}" WHERE chat_id = ${chatId};
       UPDATE "${getTableName(customers)}" SET chat_id = NULL WHERE id = '${customer.id}';
       DELETE FROM "${getTableName(chat)}" WHERE id = ${chatId};`
        )
        expect(failureTag(yield* send(chatId, a, "Nota inviata"))).toBe(
          "ChatMissing"
        )

        // Only the answer and the note: the colleague's writes run in this
        // transaction, and roll back with it
        expect(
          yield* Effect.promise(() =>
            testDb
              .select()
              .from(messages)
              .where(eq(messages.content, "Nota inviata"))
          )
        ).toEqual([])
      })
  )

  it.effect(
    "se il cliente sparisce mentre l'invio aspetta il suo lock, fallisce con ChatMissing",
    () =>
      Effect.gen(function* () {
        beforeNextLockOf(
          customers,
          `DELETE FROM "${getTableName(customers)}" WHERE id = '${customer.id}'`
        )
        expect(failureTag(yield* send(chatId, a, "Nota inviata"))).toBe(
          "ChatMissing"
        )

        expect(
          yield* Effect.promise(() =>
            testDb
              .select()
              .from(messages)
              .where(eq(messages.content, "Nota inviata"))
          )
        ).toEqual([])
      })
  )
})
