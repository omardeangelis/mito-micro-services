import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { eq } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer } from "@/test/factories"
import { type CustomerWriteWithInternalSort } from "../../process/_services/type"
import { handleCustomerUpdate } from "../_services/updateCustomers"

// Characterization of how today's import recognizes the customers already in
// the CRM (spec import-pratiche, T2), defects included: OQ1 keeps these rules
// in the rewrite, and a separate PR fixes the defects.

const NOW = new Date("2025-01-15T12:00:00.000Z")
const BEFORE = new Date("2024-06-01T08:00:00.000Z")

let rows = 0

// A customer as the conversion of a Standard file sends it, after JSON
const importedRow = (
  values: Partial<CustomerWriteWithInternalSort>
): CustomerWriteWithInternalSort => {
  const id = `row-${++rows}`
  return {
    id,
    uniqueHash: `hash-${id}`,
    tempID: id,
    fullName: "ROSSI MARIO",
    name: "MARIO",
    surname: "ROSSI",
    fiscalCode: null,
    vatCode: null,
    email: null,
    phoneNumber: null,
    fileName: "0125_import.xlsx",
    source: "internal",
    _internal_sort: 0,
    ...values,
  }
}

const crmCustomer = (values: Partial<typeof customers.$inferInsert>) =>
  createCustomer({ source: "inbound", lastImportUpdate: BEFORE, ...values })

const reload = async (id: string) => {
  const [customer] = await testDb
    .select()
    .from(customers)
    .where(eq(customers.id, id))
  return customer!
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  // The update logs its counts
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("handleCustomerUpdate", () => {
  test("con A (CF X, P.IVA Y, codice 1) e B (P.IVA Y, codice 2) nel CRM, una riga con CF X, codice 1 e senza P.IVA aggiorna sia A sia B, e nessuno dei due cambia codice cliente", async () => {
    const a = await crmCustomer({
      tempID: "1",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: "01234567890",
      name: "Mario",
    })
    const b = await crmCustomer({
      tempID: "2",
      vatCode: "01234567890",
      name: "Bianca",
    })

    await handleCustomerUpdate([
      importedRow({
        tempID: "1",
        fiscalCode: "RSSMRA80A01H501U",
        name: "MARIO AGGIORNATO",
      }),
    ])

    const [updatedA, updatedB] = [await reload(a.id), await reload(b.id)]
    expect(updatedA).toMatchObject({ tempID: "1", name: "MARIO AGGIORNATO" })
    // Defect: the update matches A's VAT number too, and B becomes a copy of A
    expect(updatedB).toMatchObject({
      tempID: "2",
      name: "MARIO AGGIORNATO",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: "01234567890",
    })
  })

  test("una riga con il CF di A e il codice di C aggiorna anche C, che diventa una copia di A", async () => {
    const a = await crmCustomer({
      tempID: "1",
      fiscalCode: "RSSMRA80A01H501U",
      name: "Mario",
    })
    const c = await crmCustomer({
      tempID: "9",
      fiscalCode: "VRDLGU70A01H501X",
      name: "Luigi",
    })

    await handleCustomerUpdate([
      importedRow({
        tempID: "9",
        fiscalCode: "RSSMRA80A01H501U",
        name: "MARIO",
      }),
    ])

    expect(await reload(a.id)).toMatchObject({ tempID: "1", name: "MARIO" })
    // Defect: the update matches the row's customer code too
    expect(await reload(c.id)).toMatchObject({
      tempID: "9",
      name: "MARIO",
      fiscalCode: "RSSMRA80A01H501U",
    })
  })

  test("un cliente del CRM riconosciuto per CF: aggiornato con i campi pieni della riga, codice cliente, id e hash restano; la risposta ha l'id e l'ordine della riga", async () => {
    const a = await crmCustomer({
      tempID: "1",
      uniqueHash: "hash-crm",
      fiscalCode: "RSSMRA80A01H501U",
      name: "Mario",
      email: "mario@example.com",
      phoneNumber: "3331234567",
    })
    const row = importedRow({
      tempID: "7",
      fiscalCode: "RSSMRA80A01H501U",
      name: "MARIO",
      comune: "ROMA",
      _internal_sort: 4,
    })

    const result = await handleCustomerUpdate([row])

    expect(result.customersToCreate).toEqual([])
    expect(result.customersToUpdate).toHaveLength(1)
    expect(result.customersToUpdate[0]).toMatchObject({
      id: row.id,
      tempID: "7",
      _internal_sort: 4,
    })
    expect(await reload(a.id)).toMatchObject({
      id: a.id,
      tempID: "1",
      uniqueHash: "hash-crm",
      name: "MARIO",
      comune: "ROMA",
      source: "internal",
      fileName: "0125_import.xlsx",
      // Empty fields of the row leave the CRM's
      email: "mario@example.com",
      phoneNumber: "3331234567",
      lastImportUpdate: NOW,
    })
  })

  test("un cliente del CRM senza CF è riconosciuto per P.IVA", async () => {
    const e = await crmCustomer({ tempID: "5", vatCode: "01234567890" })

    const result = await handleCustomerUpdate([
      importedRow({ tempID: "6", vatCode: "01234567890", name: "AZIENDA" }),
    ])

    expect(result.customersToCreate).toEqual([])
    expect(result.customersToUpdate).toHaveLength(1)
    expect(await reload(e.id)).toMatchObject({ tempID: "5", name: "AZIENDA" })
  })

  test("un cliente del CRM con CF non è riconosciuto da una riga con la sola P.IVA: la riga va tra i nuovi", async () => {
    const d = await crmCustomer({
      tempID: "3",
      fiscalCode: "RSSMRA80A01H501U",
      vatCode: "01234567890",
      name: "Mario",
    })
    const row = importedRow({ tempID: "4", vatCode: "01234567890" })

    const result = await handleCustomerUpdate([row])

    expect(result.customersToUpdate).toEqual([])
    expect(result.customersToCreate).toEqual([{ ...row, birthdayDate: null }])
    expect(await reload(d.id)).toMatchObject({
      name: "Mario",
      lastImportUpdate: BEFORE,
    })
  })

  test("una riga con un CF che il CRM non ha va tra i nuovi, anche se il suo codice cliente è già nel CRM", async () => {
    const other = await crmCustomer({ tempID: "1", fiscalCode: null })
    const row = importedRow({ tempID: "1", fiscalCode: "RSSMRA80A01H501U" })

    const result = await handleCustomerUpdate([row])

    expect(result.customersToUpdate).toEqual([])
    expect(result.customersToCreate).toEqual([{ ...row, birthdayDate: null }])
    expect(await reload(other.id)).toMatchObject({ lastImportUpdate: BEFORE })
  })

  test("senza CF né P.IVA in nessuna riga, tutte vanno tra i nuovi senza leggere il CRM", async () => {
    const other = await crmCustomer({ tempID: "1" })
    const row = importedRow({ tempID: "1" })

    const result = await handleCustomerUpdate([row])

    expect(result).toEqual({ customersToCreate: [row], customersToUpdate: [] })
    expect(await reload(other.id)).toMatchObject({ lastImportUpdate: BEFORE })
  })
})
