import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { messages } from "@mito/db/schema/chat"
import { MAX_CHAT_LIMIT } from "@mito/domain/constants/chat"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"

type Operatore = Awaited<ReturnType<typeof createOperator>>

/** A note as `chat.getChatMessagesById` returns it. */
type Nota = {
  id: number
  operatorId: number
  sendDate: Date
  content: string
}

const giorno = (day: number) =>
  new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`)

/** A customer of `operatore`, with a chat started by `operatore`: its id. */
const nuovaChatDi = async (operatore: Operatore) => {
  const customer = await createCustomer({ operatorId: operatore.id })
  const { id } = await createTestCaller(operatore).chat.createNewCustomerChat({
    customerId: customer.id,
  })
  return id
}

const leggi = (operatore: Operatore, input: { id: number; limit?: number }) =>
  createTestCaller(operatore).chat.getChatMessagesById(input)

let federica: Operatore
let collega: Operatore
let estraneo: Operatore
/** The chat of the 7 notes, the one under test */
let chatId: number
/** The 7 notes of `chatId`, by `sendDate` ascending */
let note: Nota[]
/** A chat with no notes */
let chatVuotaId: number

/** The last `limit` notes of `chatId`, by `sendDate` ascending */
const ultime = (limit: number) => note.slice(Math.max(note.length - limit, 0))

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  federica = await createOperator()
  collega = await createOperator()
  estraneo = await createOperator()

  chatId = await nuovaChatDi(federica)
  // Shuffled: the insert order is not the date order
  const giorni = [4, 7, 1, 6, 3, 5, 2]
  const inserite = await testDb
    .insert(messages)
    .values(
      giorni.map((day) => ({
        chatId,
        // Alternately federica and collega, by date
        operatorId: day % 2 === 1 ? federica.id : collega.id,
        sendDate: giorno(day),
        content: `Nota del giorno ${day}`,
      }))
    )
    .returning()
  note = inserite
    .map(({ id, operatorId, sendDate, content }) => ({
      id,
      operatorId,
      sendDate,
      content,
    }))
    .sort((a, b) => a.sendDate.getTime() - b.sendDate.getTime())

  // Control: another chat, with notes later than all of the first one's
  const altraChatId = await nuovaChatDi(federica)
  await testDb.insert(messages).values([
    {
      chatId: altraChatId,
      operatorId: collega.id,
      sendDate: giorno(8),
      content: "Altra chat, giorno 8",
    },
    {
      chatId: altraChatId,
      operatorId: federica.id,
      sendDate: giorno(9),
      content: "Altra chat, giorno 9",
    },
  ])

  chatVuotaId = await nuovaChatDi(federica)
})

describe("chat.getChatMessagesById", () => {
  it("senza limit restituisce le ultime 5 note, in ordine di invio crescente, e il totale", async () => {
    const risposta = await leggi(federica, { id: chatId })

    expect(risposta).toEqual({ messages: ultime(5), total: 7 })
  })

  it("con limit restituisce le ultime n note, mentre total conta tutte le note della chat", async () => {
    expect(await leggi(federica, { id: chatId, limit: 2 })).toEqual({
      messages: ultime(2),
      total: 7,
    })
    expect(await leggi(federica, { id: chatId, limit: 10 })).toEqual({
      messages: ultime(7),
      total: 7,
    })
  })

  it("una chat senza note, o che non esiste, dà messaggi vuoti e total 0", async () => {
    expect(await leggi(federica, { id: chatVuotaId })).toEqual({
      messages: [],
      total: 0,
    })
    expect(await leggi(federica, { id: 999999 })).toEqual({
      messages: [],
      total: 0,
    })
  })

  it("un collega che non segue la chat legge le stesse note dell'operatore del cliente", async () => {
    const dellAutore = await leggi(federica, { id: chatId })
    const delCollegaEstraneo = await leggi(estraneo, { id: chatId })

    expect(delCollegaEstraneo).toEqual(dellAutore)
    expect(delCollegaEstraneo).toEqual({ messages: ultime(5), total: 7 })
  })

  it("con limit uguale al massimo restituisce le note come con ogni altro limit", async () => {
    expect(
      await leggi(federica, { id: chatId, limit: MAX_CHAT_LIMIT })
    ).toEqual({ messages: ultime(7), total: 7 })
  })

  it.each([
    ["negativo", -1],
    ["zero", 0],
    ["non intero", 2.5],
    ["sopra il massimo", MAX_CHAT_LIMIT + 1],
  ])("con un limit %s dà BAD_REQUEST", async (_nome, limit) => {
    await expect(leggi(federica, { id: chatId, limit })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })
})
