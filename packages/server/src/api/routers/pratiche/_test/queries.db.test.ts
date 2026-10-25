import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { chat } from "@mito/db/schema/chat"
import { type practices } from "@mito/db/schema/pratiche"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"

// Le query di lettura del router `pratiche` (GET): ogni test fissa la
// risposta, riga intera compresa

type Pratica = typeof practices.$inferSelect

/** Le 13 colonne che `getPraticaById` restituisce, prese dalla riga inserita. */
const colonneDettaglio = (pratica: Pratica) => ({
  id: pratica.id,
  praticaId: pratica.praticaId,
  productId: pratica.productId,
  state: pratica.state,
  importoFinanziato: pratica.importoFinanziato,
  importoErogato: pratica.importoErogato,
  dataLiquidazione: pratica.dataLiquidazione,
  importoRata: pratica.importoRata,
  rateTotali: pratica.rateTotali,
  ratePagate: pratica.ratePagate,
  chatId: pratica.chatId,
  updatedAt: pratica.updatedAt,
  desPuntoVendita: pratica.desPuntoVendita,
})

/** Una chat del database, a cui una pratica può essere collegata. */
const createChat = async () => {
  const [created] = await testDb
    .insert(chat)
    .values({ isRead: false })
    .returning()
  return created!
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("pratiche.getPraticaById", () => {
  it("con operatore restituisce le 13 colonne della pratica e l'operatore (id, nome, cognome)", async () => {
    const chiamante = await createOperator()
    const operatore = await createOperator({ name: "Giulia", surname: "Verdi" })
    const altroOperatore = await createOperator({
      name: "Luca",
      surname: "Neri",
    })
    const customer = await createCustomer()
    const pratica = await createPractice({
      customerId: customer.id,
      praticaId: "PR-2026-0001",
      productId: "PS",
      state: "Liquidata",
      region: "Lombardia",
      desPuntoVendita: "Filiale Milano Centro",
      importoFinanziato: "12500.5",
      importoErogato: "12000",
      dataLiquidazione: new Date("2026-02-10T00:00:00.000Z"),
      importoRata: "225.4",
      rateTotali: 60,
      ratePagate: 12,
      chatId: (await createChat()).id,
      updatedAt: new Date("2026-05-20T09:30:00.000Z"),
      operatorId: operatore.id,
    })
    // Un'altra pratica, con altri valori e un altro operatore: non deve comparire
    await createPractice({
      customerId: customer.id,
      praticaId: "PR-2026-0002",
      productId: "PP",
      state: "Chiusa",
      region: "Sicilia",
      desPuntoVendita: "Filiale Palermo",
      importoFinanziato: "8000.25",
      importoErogato: "7900",
      dataLiquidazione: new Date("2025-11-03T00:00:00.000Z"),
      importoRata: "140.1",
      rateTotali: 48,
      ratePagate: 30,
      chatId: (await createChat()).id,
      updatedAt: new Date("2026-06-01T08:00:00.000Z"),
      operatorId: altroOperatore.id,
    })

    const result = await createTestCaller(chiamante).pratiche.getPraticaById({
      id: pratica.praticaId,
    })

    expect(result).toEqual({
      ...colonneDettaglio(pratica),
      operator: { id: operatore.id, name: "Giulia", surname: "Verdi" },
    })
  })

  it("di una pratica senza operatore restituisce le 13 colonne e operator: null", async () => {
    const chiamante = await createOperator()
    const altroOperatore = await createOperator({
      name: "Luca",
      surname: "Neri",
    })
    const customer = await createCustomer()
    const pratica = await createPractice({
      customerId: customer.id,
      praticaId: "PR-2026-0003",
      productId: "PS",
      state: "Rifiutata",
      region: "Veneto",
      desPuntoVendita: "Filiale Padova",
      importoFinanziato: "5400.75",
      importoErogato: "5300",
      dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
      importoRata: "95.5",
      rateTotali: 36,
      ratePagate: 4,
      chatId: (await createChat()).id,
      updatedAt: new Date("2026-04-02T12:15:00.000Z"),
      operatorId: null,
    })
    // Una pratica con operatore accanto: il left join non deve pescare il suo
    await createPractice({
      customerId: customer.id,
      praticaId: "PR-2026-0004",
      state: "Chiusa",
      chatId: (await createChat()).id,
      operatorId: altroOperatore.id,
    })

    const result = await createTestCaller(chiamante).pratiche.getPraticaById({
      id: pratica.praticaId,
    })

    expect(result).toEqual({ ...colonneDettaglio(pratica), operator: null })
  })

  it("con un ID pratica sconosciuto risponde NOT_FOUND 'Pratica non trovata'", async () => {
    const chiamante = await createOperator()
    const customer = await createCustomer()
    await createPractice({
      customerId: customer.id,
      praticaId: "PR-2026-0005",
    })

    const error = await rejectionOf(
      createTestCaller(chiamante).pratiche.getPraticaById({
        id: "PR-INESISTENTE",
      })
    )

    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Pratica non trovata",
      cause: { code: "PRACTICE_NOT_FOUND" },
    })
  })
})

// PGlite le ordina anche senza `ORDER BY`: il test che lo protegge è in
// `queries.pg.test.ts`
describe("pratiche.getAllAvailableRegion", () => {
  it("restituisce una riga per regione distinta in ordine alfabetico, null per ultima", async () => {
    const chiamante = await createOperator()
    const customer = await createCustomer()
    await createPractice({ customerId: customer.id, region: "B" })
    await createPractice({ customerId: customer.id, region: null })
    await createPractice({ customerId: customer.id, region: "A" })
    await createPractice({ customerId: customer.id, region: "A" })

    const result =
      await createTestCaller(chiamante).pratiche.getAllAvailableRegion()

    expect(result).toEqual([{ region: "A" }, { region: "B" }, { region: null }])
  })
})
