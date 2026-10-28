import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  ChatMissing,
  CustomerNotFound,
  isApiError,
  MessageMissing,
  NotMessageAuthor,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { chat, messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { createCustomer, createOperator } from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

/** The session the backend read for the request: `userId`'s, or none */
const sessionOf = (userId: string | null) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed(
        userId === null
          ? null
          : { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" }
      ),
  })

/** The client of the groups `chat` and `operator`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["chat", "operator"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const notesOf = (chatId: number) =>
  given(() =>
    testDb
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .where(eq(messages.chatId, chatId))
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("POST /api/v1/chat", () => {
  it.effect(
    "crea la chat del cliente con l'operatore, e una seconda volta dà la stessa",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const api = yield* clientAs(operator.userId)

        const created = yield* api.chat.createNewCustomerChat({
          payload: { customerId: customer.id },
        })
        const again = yield* api.chat.createNewCustomerChat({
          payload: { customerId: customer.id },
        })

        assert.strictEqual(again.id, created.id)
        const [saved] = yield* given(() =>
          testDb
            .select({ chatId: customers.chatId })
            .from(customers)
            .where(eq(customers.id, customer.id))
        )
        assert.strictEqual(saved?.chatId, created.id)
      })
  )

  it.effect("un cliente che non esiste è CustomerNotFound", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.chat.createNewCustomerChat({ payload: { customerId: "nessuno" } })
      )

      assert.instanceOf(error, CustomerNotFound)
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const customer = yield* given(() => createCustomer())
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(
        api.chat.createNewCustomerChat({ payload: { customerId: customer.id } })
      )

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("POST /api/v1/chat/:id/messages", () => {
  it.effect("salva la nota dell'operatore della sessione e la dà", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      const api = yield* clientAs(operator.userId)
      const { id } = yield* api.chat.createNewCustomerChat({
        payload: { customerId: customer.id },
      })
      yield* given(() =>
        testDb.update(chat).set({ isRead: true }).where(eq(chat.id, id))
      )

      const note = yield* api.chat.insertMessage({
        params: { id },
        payload: { content: "Richiamare domani" },
      })

      assert.isNotNull(note)
      assert.strictEqual(note.chatId, id)
      assert.strictEqual(note.operatorId, operator.id)
      assert.strictEqual(note.content, "Richiamare domani")
      assert.instanceOf(note.sendDate, Date)
      assert.isNull(note.notifyDate)
      assert.deepStrictEqual(yield* notesOf(id), [
        { id: note.id, content: "Richiamare domani" },
      ])
      // The chat is unread again
      const [row] = yield* given(() =>
        testDb.select().from(chat).where(eq(chat.id, id))
      )
      assert.isFalse(row?.isRead)
    })
  )

  it.effect("una chat che non esiste è ChatMissing, e non salva nulla", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.chat.insertMessage({
          params: { id: 999_999 },
          payload: { content: "Nota" },
        })
      )

      assert.deepStrictEqual(error, new ChatMissing({ chatId: 999_999 }))
      assert.deepStrictEqual(yield* notesOf(999_999), [])
    })
  )
})

describe("GET /api/v1/chat/:id", () => {
  it.effect(
    "dà le ultime 5 note, dalla più vecchia, e quante sono; con limit le ultime limit",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() => createCustomer())
        const api = yield* clientAs(operator.userId)
        const { id } = yield* api.chat.createNewCustomerChat({
          payload: { customerId: customer.id },
        })
        for (const n of [1, 2, 3, 4, 5, 6, 7]) {
          yield* api.chat.insertMessage({
            params: { id },
            payload: { content: `Nota ${n}` },
          })
        }

        const five = yield* api.chat.getChatMessagesById({
          params: { id },
          query: {},
        })
        const two = yield* api.chat.getChatMessagesById({
          params: { id },
          query: { limit: 2 },
        })

        assert.strictEqual(five.total, 7)
        assert.deepStrictEqual(
          five.messages.map(({ content }) => content),
          ["Nota 3", "Nota 4", "Nota 5", "Nota 6", "Nota 7"]
        )
        assert.strictEqual(five.messages[0]?.operatorId, operator.id)
        assert.instanceOf(five.messages[0]?.sendDate, Date)
        assert.strictEqual(two.total, 7)
        assert.deepStrictEqual(
          two.messages.map(({ content }) => content),
          ["Nota 6", "Nota 7"]
        )
      })
  )

  it.effect("un limit oltre 500 non passa lo schema del contratto", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.chat.getChatMessagesById({
          params: { id: 1 },
          query: { limit: 501 },
        })
      )

      assert.isFalse(isApiError(error))
    })
  )
})

describe("DELETE /api/v1/chat/messages/:id", () => {
  const noteBy = (author: { id: number; userId: string }) =>
    Effect.gen(function* () {
      const customer = yield* given(() => createCustomer())
      const api = yield* clientAs(author.userId)
      const { id: chatId } = yield* api.chat.createNewCustomerChat({
        payload: { customerId: customer.id },
      })
      yield* api.chat.insertMessage({
        params: { id: chatId },
        payload: { content: "Prima" },
      })
      const note = yield* api.chat.insertMessage({
        params: { id: chatId },
        payload: { content: "Seconda" },
      })
      return { chatId, noteId: note!.id }
    })

  it.effect("l'autore elimina la sua nota", () =>
    Effect.gen(function* () {
      const author = yield* given(() => createOperator())
      const { chatId, noteId } = yield* noteBy(author)
      const api = yield* clientAs(author.userId)

      yield* api.chat.deleteMessage({ params: { id: noteId } })

      assert.deepStrictEqual(
        (yield* notesOf(chatId)).map(({ content }) => content),
        ["Prima"]
      )
    })
  )

  it.effect("un altro operatore, anche admin, è NotMessageAuthor", () =>
    Effect.gen(function* () {
      const author = yield* given(() => createOperator())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const { chatId, noteId } = yield* noteBy(author)
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.chat.deleteMessage({ params: { id: noteId } })
      )

      assert.deepStrictEqual(error, new NotMessageAuthor({ messageId: noteId }))
      assert.lengthOf(yield* notesOf(chatId), 2)
    })
  )

  it.effect("una nota che non esiste è MessageMissing", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.chat.deleteMessage({ params: { id: 999_999 } })
      )

      assert.deepStrictEqual(error, new MessageMissing({ messageId: 999_999 }))
    })
  )
})

describe("GET /api/v1/operator/:id", () => {
  it.effect("dà l'operatore con il ruolo, null se non esiste", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator({ name: "Ada" }))
      const api = yield* clientAs(operator.userId)

      const found = yield* api.operator.getOperatorById({
        params: { id: operator.id },
      })
      const none = yield* api.operator.getOperatorById({
        params: { id: 999_999 },
      })

      assert.strictEqual(found?.id, operator.id)
      assert.strictEqual(found?.name, "Ada")
      assert.strictEqual(found?.role, "OPERATORE")
      assert.isNull(none)
    })
  )

  it.effect(
    "un id oltre l'intero di Postgres non passa lo schema del contratto",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const error = yield* Effect.flip(
          api.operator.getOperatorById({ params: { id: 2_147_483_648 } })
        )

        assert.isFalse(isApiError(error))
      })
  )
})
