import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { customers } from "@mito/db/schema/customers"

// Pin della riga intera di `customer.getAllCustomers` (AC7), prima del refactor
// del router su Effect: ogni colonna della select, `operatore` e
// `signedPractices`, con `toEqual` e non con `toMatchObject`

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const CREATED_AT = new Date("2026-02-03T09:15:00.000Z")
const UPDATED_AT = new Date("2026-03-04T10:20:00.000Z")
const BIRTHDAY = new Date("1980-01-01T00:00:00.000Z")

/** Timestamp e data di nascita come sono scritti nel database. */
async function storedDates(id: string) {
  const [row] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, id))
  return {
    createdAt: row!.createdAt,
    updatedAt: row!.updatedAt,
    birthdayDate: row!.birthdayDate,
  }
}

/**
 * La riga attesa del cliente completo: le 15 colonne della select con i valori
 * scritti in `createCustomer`, più `operatore` e `signedPractices`.
 */
function completeRow(
  dates: Awaited<ReturnType<typeof storedDates>>,
  operator: { id: number; name: string | null; surname: string | null },
  signedPractices: number
) {
  return {
    id: "cliente-completo",
    name: "Mariangela",
    surname: "Rossignoli",
    fiscalCode: "RSSMNG80A41H501Z",
    email: "mariangela@example.com",
    phoneNumber: "3331112222",
    comune: "Civitavecchia",
    vatCode: "IT01234567890",
    birthdayDate: dates.birthdayDate,
    blackListStatus: "review",
    sede: "Roma",
    ambitoLavorativo: "Edilizia",
    occupazione: "Operaio",
    createdAt: dates.createdAt,
    updatedAt: dates.updatedAt,
    operatore: {
      id: operator.id,
      name: operator.name,
      surname: operator.surname,
    },
    signedPractices,
  }
}

/** Il cliente completo, assegnato a `operatorId`, con i valori di `completeRow`. */
function insertCompleteCustomer(operatorId: number) {
  return createCustomer({
    id: "cliente-completo",
    name: "Mariangela",
    surname: "Rossignoli",
    fiscalCode: "RSSMNG80A41H501Z",
    email: "mariangela@example.com",
    phoneNumber: "3331112222",
    comune: "Civitavecchia",
    vatCode: "IT01234567890",
    birthdayDate: BIRTHDAY,
    blackListStatus: "review",
    sede: "Roma",
    ambitoLavorativo: "Edilizia",
    occupazione: "Operaio",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    operatorId,
  })
}

describe("customer.getAllCustomers, riga intera", () => {
  it("`getAllCustomers` restituisce per un cliente completo esattamente le 15 colonne della select, il suo `operatore` e `signedPractices: 2`", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    const caller = createTestCaller(operator)
    const customer = await insertCompleteCustomer(operator.id)
    // Due pratiche: `signedPractices` le conta entrambe, senza filtrare per stato
    await createPractice({ customerId: customer.id })
    await createPractice({ customerId: customer.id })

    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
    })

    const dates = await storedDates(customer.id)
    expect(allCustomers).toEqual([
      completeRow(
        dates,
        { id: operator.id, name: "Giulia", surname: "Verdi" },
        2
      ),
    ])
    expect(total).toBe(1)
  })

  it("un cliente senza operatore ha `operatore: null`, `signedPractices: 0` e le altre colonne a null", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    const caller = createTestCaller(operator)
    const free = await createCustomer({
      id: "cliente-libero",
      name: "Zeno",
      surname: "Zanetti",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    })

    const { allCustomers } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
    })

    const dates = await storedDates(free.id)
    expect(allCustomers).toEqual([
      {
        id: "cliente-libero",
        name: "Zeno",
        surname: "Zanetti",
        fiscalCode: null,
        email: null,
        phoneNumber: null,
        comune: null,
        vatCode: null,
        birthdayDate: null,
        blackListStatus: "whitelisted",
        sede: null,
        ambitoLavorativo: null,
        occupazione: null,
        createdAt: dates.createdAt,
        updatedAt: dates.updatedAt,
        operatore: null,
        signedPractices: 0,
      },
    ])
  })

  it("una pagina con i due clienti li restituisce interi, ordinati per `name`, con `total: 2`", async () => {
    const operator = await createOperator({ name: "Giulia", surname: "Verdi" })
    const caller = createTestCaller(operator)
    const complete = await insertCompleteCustomer(operator.id)
    await createPractice({ customerId: complete.id })
    await createPractice({ customerId: complete.id })
    const free = await createCustomer({
      id: "cliente-libero",
      name: "Zeno",
      surname: "Zanetti",
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    })

    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      orderBy: "name",
      sortedBy: "asc",
    })

    const completeDates = await storedDates(complete.id)
    const freeDates = await storedDates(free.id)
    // "Mariangela" prima di "Zeno": l'ordine non dipende da pareggi
    expect(allCustomers).toEqual([
      completeRow(
        completeDates,
        { id: operator.id, name: "Giulia", surname: "Verdi" },
        2
      ),
      {
        id: "cliente-libero",
        name: "Zeno",
        surname: "Zanetti",
        fiscalCode: null,
        email: null,
        phoneNumber: null,
        comune: null,
        vatCode: null,
        birthdayDate: null,
        blackListStatus: "whitelisted",
        sede: null,
        ambitoLavorativo: null,
        occupazione: null,
        createdAt: freeDates.createdAt,
        updatedAt: freeDates.updatedAt,
        operatore: null,
        signedPractices: 0,
      },
    ])
    expect(total).toBe(2)
  })
})
