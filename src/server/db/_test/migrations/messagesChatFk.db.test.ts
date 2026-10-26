import { beforeAll, describe, expect, it } from "vitest"
import { AUTH_DATA_SCHEMA_TAG, migrateUpTo, testClient } from "@/test/db"

// The foreign key of messages.chat_id (TD10 c) on a database already in use:
// migrated up to the migration before, seeded with a chat with notes and an
// empty chat, then migrated to the end, as the deploy runs it.

let chatWithNotes: number
let emptyChat: number

const notesOf = async (chatId: number) => {
  const { rows } = await testClient.query<{ id: number }>(
    `SELECT id FROM "mito-deutsche_messages" WHERE chat_id = $1`,
    [chatId]
  )
  return rows.length
}

const newChat = async () => {
  const { rows } = await testClient.query<{ id: number }>(
    `INSERT INTO "mito-deutsche_chat" DEFAULT VALUES RETURNING id`
  )
  return rows[0]!.id
}

const insertNote = (chatId: number) =>
  testClient.query(
    `INSERT INTO "mito-deutsche_messages" (operator_id, chat_id, content)
     VALUES (1, $1, 'Nota')`,
    [chatId]
  )

beforeAll(async () => {
  await migrateUpTo(AUTH_DATA_SCHEMA_TAG)
  chatWithNotes = await newChat()
  await insertNote(chatWithNotes)
  await insertNote(chatWithNotes)
  emptyChat = await newChat()

  await migrateUpTo()
})

describe("foreign key di messages.chat_id", () => {
  it("le note già salvate restano, con la loro chat", async () => {
    expect(await notesOf(chatWithNotes)).toBe(2)
  })

  it("una nota di una chat che non esiste non si salva", async () => {
    await expect(insertNote(999999)).rejects.toMatchObject({ code: "23503" })
    expect(await notesOf(999999)).toBe(0)
  })

  it("una chat con note non si cancella, e le note restano", async () => {
    await expect(
      testClient.query(`DELETE FROM "mito-deutsche_chat" WHERE id = $1`, [
        chatWithNotes,
      ])
    ).rejects.toMatchObject({ code: "23503" })
    expect(await notesOf(chatWithNotes)).toBe(2)
  })

  it("una chat senza note si cancella, come dopo l'eliminazione dell'ultima nota", async () => {
    await testClient.query(`DELETE FROM "mito-deutsche_chat" WHERE id = $1`, [
      emptyChat,
    ])
    const { rows } = await testClient.query(
      `SELECT id FROM "mito-deutsche_chat" WHERE id = $1`,
      [emptyChat]
    )
    expect(rows).toEqual([])
  })
})
