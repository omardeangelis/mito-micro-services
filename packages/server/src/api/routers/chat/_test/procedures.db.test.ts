import { TRPCError } from "@trpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { messages } from "@mito/db/schema/chat"
import { appRouter } from "../../../root"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator, createUser } from "@/test/factories"

// Guard of each procedure of the `chat` router: all of them are
// operatorProcedure (a session, then an active operator).
// The procedures a later task removes stay out of the table.

const REMOVED = [
  "getChatById",
  "getUniqueChatOperator",
  "addOperatorToChat",
] as const

type Removed = (typeof REMOVED)[number]

type Guard = "operator"

type ChatProcedure = Exclude<
  keyof typeof appRouter._def.record.chat._def.record,
  Removed
>

type Caller = ReturnType<typeof createTestCaller>

type Author = Awaited<ReturnType<typeof createOperator>>

/** Dati creati prima di ogni test, usati come input validi. */
type Fixtures = {
  customerId: string
  chatId: number
  messageId: number
  author: Author
}

type ProcedureSpec = {
  guard: Guard
  call: (caller: Caller, fixtures: Fixtures) => Promise<unknown>
}

/** Una riga per procedura: la guardia attesa e una chiamata con input valido. */
const PROCEDURES = {
  getChatMessagesById: {
    guard: "operator",
    call: (c, f) => c.chat.getChatMessagesById({ id: f.chatId }),
  },
  insertMessage: {
    guard: "operator",
    call: (c, f) =>
      c.chat.insertMessage({ chatId: f.chatId, content: "Nota nuova" }),
  },
  createNewCustomerChat: {
    guard: "operator",
    call: (c, f) => c.chat.createNewCustomerChat({ customerId: f.customerId }),
  },
  deleteMessage: {
    guard: "operator",
    call: (c, f) => c.chat.deleteMessage({ id: f.messageId }),
  },
} satisfies Record<ChatProcedure, ProcedureSpec>

const names = Object.keys(PROCEDURES) as ChatProcedure[]
const operatorNames = names.filter(
  (name) => PROCEDURES[name].guard === "operator"
)

/** Le chiavi del router, senza le procedure rimosse. */
const routerKeys = () => {
  const removed: readonly string[] = REMOVED
  return Object.keys(appRouter._def.record.chat._def.record)
    .filter((key) => !removed.includes(key))
    .sort()
}

let fixtures: Fixtures

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  const author = await createOperator({ role: "OPERATORE" })
  const customer = await createCustomer()
  const { id: chatId } = await createTestCaller(
    author
  ).chat.createNewCustomerChat({ customerId: customer.id })
  const [note] = await testDb
    .insert(messages)
    .values({ chatId, operatorId: author.id, content: "Nota" })
    .returning({ id: messages.id })
  fixtures = {
    customerId: customer.id,
    chatId,
    messageId: note!.id,
    author,
  }
})

describe("chat: guardia di ogni procedura", () => {
  it("la tabella copre esattamente le procedure del router chat", () => {
    expect([...names].sort()).toEqual(routerKeys())
  })

  describe("utente senza operatore", () => {
    it.each(names)(
      "%s rifiuta con BAD_REQUEST: non è un operatore",
      async (name) => {
        const caller = createTestCaller(await createUser())
        const error = await rejectionOf(PROCEDURES[name].call(caller, fixtures))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "BAD_REQUEST",
          message: "BAD_REQUEST",
        })
      }
    )
  })

  describe("operatore disattivato", () => {
    it.each(names)(
      "%s rifiuta con UNAUTHORIZED: utente disattivato",
      async (name) => {
        const caller = createTestCaller(
          await createOperator({ disabledAt: new Date() })
        )
        const error = await rejectionOf(PROCEDURES[name].call(caller, fixtures))
        expect(error).toBeInstanceOf(TRPCError)
        expect(error).toMatchObject({
          code: "UNAUTHORIZED",
          message: "Utente disattivato",
        })
      }
    )
  })

  describe("operatore attivo", () => {
    it.each(operatorNames)("%s passa con un operatore attivo", async (name) => {
      // The note's author, so deleteMessage passes too
      const caller = createTestCaller(fixtures.author)
      // A rejection fails the test
      await PROCEDURES[name].call(caller, fixtures)
    })
  })
})
