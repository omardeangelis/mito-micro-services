import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq, getTableName } from "drizzle-orm"
import { chat } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { createTestCaller } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createOperator } from "@/test/factories"
import { beforeNextLockOf } from "@/test/failpoint"

const chatIdOf = async (customerId: string) => {
  const [row] = await testDb
    .select({ chatId: customers.chatId })
    .from(customers)
    .where(eq(customers.id, customerId))
  return row?.chatId
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("chat.createNewCustomerChat", () => {
  it("crea la chat, la collega al cliente e vi aggiunge l'operatore", async () => {
    const operator = await createOperator()
    const customer = await createCustomer()

    const created = await createTestCaller(operator).chat.createNewCustomerChat(
      { customerId: customer.id }
    )

    expect(await chatIdOf(customer.id)).toBe(created.id)
    expect(await testDb.select().from(chatToOperator)).toEqual([
      { chatId: created.id, operatorId: operator.id },
    ])
  })

  it("se il cliente ha già una chat la restituisce senza crearne un'altra", async () => {
    const federica = await createOperator()
    const collega = await createOperator()
    const customer = await createCustomer()
    const first = await createTestCaller(federica).chat.createNewCustomerChat({
      customerId: customer.id,
    })

    // A second click, a page not refreshed yet, or a colleague on the same customer
    const second = await createTestCaller(collega).chat.createNewCustomerChat({
      customerId: customer.id,
    })

    expect(second.id).toBe(first.id)
    expect(await chatIdOf(customer.id)).toBe(first.id)
    expect(await testDb.select({ id: chat.id }).from(chat)).toEqual([
      { id: first.id },
    ])
  })

  it("se un collega avvia la chat mentre aspetta il cliente, restituisce la sua", async () => {
    const federica = await createOperator()
    const collega = await createOperator()
    const customer = await createCustomer()
    // The colleague's "Avvia una chat" commits while this one waits for the lock
    beforeNextLockOf(
      customers,
      `INSERT INTO "${getTableName(chat)}" (id, is_read) OVERRIDING SYSTEM VALUE VALUES (900, false);
       UPDATE "${getTableName(customers)}" SET chat_id = 900 WHERE id = '${customer.id}';
       INSERT INTO "${getTableName(chatToOperator)}" (chat_id, operator_id) VALUES (900, ${collega.id});`
    )

    const created = await createTestCaller(federica).chat.createNewCustomerChat(
      { customerId: customer.id }
    )

    expect(created.id).toBe(900)
    expect(await chatIdOf(customer.id)).toBe(900)
    expect(await testDb.select({ id: chat.id }).from(chat)).toEqual([
      { id: 900 },
    ])
  })

  it("per un cliente che non esiste non crea nessuna chat", async () => {
    const operator = await createOperator()

    await expect(
      createTestCaller(operator).chat.createNewCustomerChat({
        customerId: "missing",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    expect(await testDb.select().from(chat)).toEqual([])
    expect(await testDb.select().from(chatToOperator)).toEqual([])
  })
})
