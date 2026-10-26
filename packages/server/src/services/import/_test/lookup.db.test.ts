import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import { Effect } from "effect"
import { type Cells, classifyRows } from "@mito/domain/import/classify"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { type LookupKeys } from "@mito/domain/import/payload"
import { planRows } from "@mito/domain/import/plan"
import { waveCells } from "@mito/domain/import/_test/cells"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { importUpload } from "@mito/db/schema/importRun"
import { DbLive } from "../../../effect/db"
import { lookupExisting } from "../lookup"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createCustomer, createPractice } from "@/test/factories"

// What the CRM has for the keys of a file (`import.lookup`, T8b), and the
// plan of the domain on it: the numbers of the preview and today's
// recognition of the customers (T2, D11), on the database

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"

const CF_A = "RSSMRA80A01H501U"
const CF_B = "VRDLGU75B02F205X"
const CF_C = "BNCGNN70C03L219Y"
const VAT = "01234567890"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const keys = (values: Partial<LookupKeys>): LookupKeys => ({
  fiscalCodes: [],
  vatCodes: [],
  customerCodes: [],
  praticaIds: [],
  ...values,
})

const lookup = (values: LookupKeys) =>
  Effect.runPromise(lookupExisting(values).pipe(Effect.provide(DbLive)))

/** The preview of the rows on the CRM of the test, as the browser makes it. */
const preview = async (...rows: Cells[]) => {
  const classified = classifyRows(
    "wave",
    rows.map((cells, index) => ({ row: index + 2, cells: waveCells(cells) })),
    NOW,
    FILE_NAME
  )
  const crm = await lookup(lookupKeys(groupRows(classified)))
  return planRows(classified, crm)
}

const ids = (state: { customers: readonly { id: string }[] }) =>
  state.customers.map((customer) => customer.id)

describe("lookupExisting", () => {
  test("con A (CF X, P.IVA Y) e B (P.IVA Y), le chiavi di una riga con solo CF X restituiscono A e B", async () => {
    await createCustomer({ id: "a", fiscalCode: CF_A, vatCode: VAT })
    await createCustomer({ id: "b", vatCode: VAT })

    const crm = await lookup(keys({ fiscalCodes: [CF_A] }))

    expect(ids(crm)).toEqual(["a", "b"])
  })

  test("trova i clienti per codice fiscale, partita IVA e codice cliente, in ordine di id", async () => {
    await createCustomer({ id: "c3", tempID: "5003" })
    await createCustomer({ id: "c1", tempID: "5001", fiscalCode: CF_A })
    await createCustomer({ id: "c2", tempID: "5002", vatCode: VAT })
    await createCustomer({ id: "c4", tempID: "5004", fiscalCode: CF_C })

    const crm = await lookup(
      keys({ fiscalCodes: [CF_A], vatCodes: [VAT], customerCodes: ["5003"] })
    )

    expect(crm.customers).toEqual([
      { id: "c1", fiscalCode: CF_A, vatCode: null, tempID: "5001" },
      { id: "c2", fiscalCode: null, vatCode: VAT, tempID: "5002" },
      { id: "c3", fiscalCode: null, vatCode: null, tempID: "5003" },
    ])
  })

  test("la partita IVA di un cliente trovato solo per codice cliente non porta altri clienti", async () => {
    await createCustomer({ id: "a", tempID: "5001", vatCode: VAT })
    await createCustomer({ id: "b", vatCode: VAT })

    const crm = await lookup(keys({ customerCodes: ["5001"] }))

    expect(ids(crm)).toEqual(["a"])
  })

  test("le pratiche del file che esistono e i loro legami", async () => {
    const anna = await createCustomer({ id: "anna" })
    const piero = await createCustomer({ id: "piero" })
    await createPractice({ customerId: anna.id, praticaId: "P1" })
    await createPractice({ customerId: piero.id, praticaId: "P2" })
    await testDb
      .insert(customerToPratica)
      .values({ customerId: anna.id, praticaId: "P2", customerRole: "Garante" })
    await createPractice({ customerId: anna.id, praticaId: "P9" })

    const crm = await lookup(keys({ praticaIds: ["P1", "P2", "P3"] }))

    expect([...crm.praticaIds].sort()).toEqual(["P1", "P2"])
    expect(
      [...crm.links].sort((a, b) =>
        `${a.praticaId}${a.customerId}`.localeCompare(
          `${b.praticaId}${b.customerId}`
        )
      )
    ).toEqual([
      { customerId: "anna", praticaId: "P1" },
      { customerId: "anna", praticaId: "P2" },
      { customerId: "piero", praticaId: "P2" },
    ])
  })

  test("senza chiavi non trova nulla", async () => {
    await createCustomer({ fiscalCode: CF_A })

    expect(await lookup(keys({}))).toEqual({
      customers: [],
      praticaIds: [],
      links: [],
    })
  })

  test("non scrive nulla", async () => {
    const anna = await createCustomer({ id: "anna", fiscalCode: CF_A })
    await createPractice({ customerId: anna.id, praticaId: "P1" })
    const before = await Promise.all([
      testDb.select().from(customers),
      testDb.select().from(practices),
      testDb.select().from(customerToPratica),
      testDb.select().from(importUpload),
    ])

    await preview(
      { "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "5002", "n° Pratica": "P2" }
    )

    expect(
      await Promise.all([
        testDb.select().from(customers),
        testDb.select().from(practices),
        testDb.select().from(customerToPratica),
        testDb.select().from(importUpload),
      ])
    ).toEqual(before)
  })
})

describe("anteprima sul CRM (AC7, D11)", () => {
  test("un cliente esistente e uno nuovo con due pratiche: i numeri dell'anteprima", async () => {
    await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })

    const { counts } = await preview(
      { "Codice Fiscale": CF_A, "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P2" },
      { "Codice Fiscale": CF_B, "Codice NDG": "2", "n° Pratica": "P3" }
    )

    expect(counts).toMatchObject({
      customersNew: 1,
      customersToUpdate: 1,
      practicesNew: 3,
      linksNew: 3,
    })
  })

  test("pratiche e legami che esistono si aggiornano e restano", async () => {
    const a = await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
    await createPractice({ customerId: a.id, praticaId: "P1" })
    const other = await createCustomer({ id: "z" })
    await createPractice({ customerId: other.id, praticaId: "P2" })

    const result = await preview(
      { "Codice NDG": "1", "n° Pratica": "P1" },
      { "Codice NDG": "1", "n° Pratica": "P2" },
      { "Codice NDG": "1", "n° Pratica": "P3" }
    )

    expect(result.counts).toMatchObject({
      practicesNew: 1,
      practicesToUpdate: 2,
      linksNew: 2,
    })
    expect(result.linksNew.map((link) => link.praticaId)).toEqual(["P2", "P3"])
  })

  test("una riga col CF di A aggiorna anche B, che ha la partita IVA di A", async () => {
    await createCustomer({
      id: "a",
      tempID: "1",
      fiscalCode: CF_A,
      vatCode: VAT,
    })
    await createCustomer({ id: "b", tempID: "2", vatCode: VAT })

    const result = await preview({ "Codice Fiscale": CF_A, "Codice NDG": "1" })

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([
      ["a", "b"],
    ])
  })

  test("una riga col CF di A e il codice di C aggiorna A e C", async () => {
    await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })
    await createCustomer({ id: "c", tempID: "3", fiscalCode: CF_C })

    const result = await preview({ "Codice Fiscale": CF_A, "Codice NDG": "3" })

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([
      ["a", "c"],
    ])
  })

  test("riconosciuto dalla partita IVA quando il cliente del CRM non ha CF", async () => {
    await createCustomer({ id: "d", tempID: "4", vatCode: VAT })

    const result = await preview({ "Codice Fiscale": VAT, "Codice NDG": "4" })

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([["d"]])
  })

  test("un cliente del CRM con CF non è riconosciuto da una riga con la sola partita IVA", async () => {
    await createCustomer({
      id: "e",
      tempID: "5",
      fiscalCode: CF_A,
      vatCode: VAT,
    })

    const result = await preview({ "Codice Fiscale": VAT, "Codice NDG": "6" })

    expect(result.counts).toMatchObject({
      customersNew: 1,
      customersToUpdate: 0,
    })
  })

  test("con due clienti con lo stesso CF il primo è quello con l'id minore, e si aggiornano entrambi", async () => {
    await createCustomer({ id: "secondo", tempID: "7", fiscalCode: CF_A })
    await createCustomer({ id: "primo", tempID: "1", fiscalCode: CF_A })

    const result = await preview({ "Codice Fiscale": CF_A, "Codice NDG": "1" })

    expect(result.customerUpdates.map((update) => update.ids)).toEqual([
      ["primo", "secondo"],
    ])
    expect(result.linksNew[0]?.customer).toEqual({ id: "primo" })
  })

  test("un cliente nuovo con un codice cliente che il CRM ha già è scartato (AC11b)", async () => {
    await createCustomer({ id: "a", tempID: "1", fiscalCode: CF_A })

    const result = await preview({ "Codice Fiscale": CF_B, "Codice NDG": "1" })

    expect(result.discarded).toEqual([
      { row: 2, reasons: ["Codice cliente già usato da un altro cliente"] },
    ])
  })
})
