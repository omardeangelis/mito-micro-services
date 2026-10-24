import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"

// I filtri avanzati di Clienti per tipo di colonna: ogni colonna della mappa
// filtra come oggi (AC6, AC7), le voci non valide si scartano (AC8, AC9)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type Caller = ReturnType<typeof createTestCaller>
type Input = Parameters<Caller["customer"]["getAllCustomers"]>[0]
type Filter = { field: string; op: string; value: string }

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`)

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const young = await createCustomer({
    age: 30,
    birthdayDate: midnight("1990-12-31"),
    source: "inbound",
    comune: "Civitavecchia",
    sede: "Roma Nord",
    phoneNumber: "3331112222",
    ambitoLavorativo: "Pubblico impiego",
    occupazione: "Insegnante",
  })
  const middle = await createCustomer({
    age: 40,
    birthdayDate: midnight("1980-06-15"),
    source: "passaparola",
    comune: "Milano",
    sede: "Milano Centro",
    phoneNumber: "3409998888",
    ambitoLavorativo: "Privato",
    occupazione: "Impiegato",
  })
  const old = await createCustomer({
    age: 50,
    birthdayDate: midnight("1970-01-01"),
    source: "digital",
    comune: "Napoli",
    sede: "Napoli Est",
    phoneNumber: "0811234567",
    ambitoLavorativo: "Pensionato",
    occupazione: "Pensionato",
  })
  const list = async (advancedFilters: Filter[]) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 50,
      advancedFilters,
    } as unknown as Input)
    return { ids: allCustomers.map((c) => c.id).sort(), total }
  }
  const ids = (...customers: { id: string }[]) => ({
    ids: customers.map((c) => c.id).sort(),
    total: customers.length,
  })
  return { young, middle, old, list, ids }
}

const f = (field: string, op: string, value: string): Filter => ({
  field,
  op,
  value,
})

describe("customer.getAllCustomers, un filtro valido per ogni colonna (AC6, AC7)", () => {
  it("le colonne di testo cercano 'contiene', senza distinguere maiuscole", async () => {
    const { young, middle, list, ids } = await seed()
    expect(await list([f("comune", "eq", "VECCHIA")])).toEqual(ids(young))
    expect(await list([f("sede", "eq", "centro")])).toEqual(ids(middle))
    expect(await list([f("phone_number", "eq", "333")])).toEqual(ids(young))
    expect(await list([f("ambito_lavorativo", "eq", "priv")])).toEqual(
      ids(middle)
    )
    expect(await list([f("occupazione", "eq", "insegn")])).toEqual(ids(young))
  })

  it("source è un uguale esatto", async () => {
    const { middle, list, ids } = await seed()
    expect(await list([f("source", "eq", "passaparola")])).toEqual(ids(middle))
  })

  it("age con i 5 operatori", async () => {
    const { young, middle, old, list, ids } = await seed()
    expect(await list([f("age", "eq", "40")])).toEqual(ids(middle))
    expect(await list([f("age", "gt", "40")])).toEqual(ids(old))
    expect(await list([f("age", "lt", "40")])).toEqual(ids(young))
    expect(await list([f("age", "gte", "40")])).toEqual(ids(middle, old))
    expect(await list([f("age", "lte", "40")])).toEqual(ids(young, middle))
  })

  it("birthday_date con i 5 operatori", async () => {
    const { young, middle, old, list, ids } = await seed()
    const day = "1980-06-15"
    expect(await list([f("birthday_date", "eq", day)])).toEqual(ids(middle))
    expect(await list([f("birthday_date", "gt", day)])).toEqual(ids(young))
    expect(await list([f("birthday_date", "lt", day)])).toEqual(ids(old))
    expect(await list([f("birthday_date", "gte", day)])).toEqual(
      ids(young, middle)
    )
    expect(await list([f("birthday_date", "lte", day)])).toEqual(
      ids(middle, old)
    )
    // Il formato senza zeri del popover
    expect(await list([f("birthday_date", "eq", "1970-1-1")])).toEqual(ids(old))
  })

  it("più filtri insieme si applicano tutti", async () => {
    const { middle, list, ids } = await seed()
    expect(
      await list([f("age", "gte", "40"), f("comune", "eq", "mil")])
    ).toEqual(ids(middle))
  })
})

describe("customer.getAllCustomers, date nel fuso della sessione (D11)", () => {
  it("con la sessione in Europe/Rome, gte 2026-01-15 trova chi è nato il 14 alle 23:30 UTC, lt no", async () => {
    const { list, ids } = await seed()
    // Il 15 gennaio alle 00:30 a Roma
    const night = await createCustomer({
      birthdayDate: new Date("2026-01-14T23:30:00.000Z"),
    })
    await testClient.exec(`SET TIME ZONE 'Europe/Rome'`)
    try {
      expect(await list([f("birthday_date", "gte", "2026-01-15")])).toEqual(
        ids(night)
      )
      expect(
        await list([
          f("birthday_date", "lt", "2026-01-15"),
          f("birthday_date", "gte", "2026-01-01"),
        ])
      ).toEqual({ ids: [], total: 0 })
    } finally {
      await testClient.exec(`SET TIME ZONE 'UTC'`)
    }
  })
})

describe("customer.getAllCustomers, voci non valide scartate (AC8, AC9)", () => {
  // Ogni voce non valida sta accanto a un filtro valido, che si applica
  const valid = f("comune", "eq", "vecchia")

  it.each([
    ["una colonna fuori mappa", f("temp_id", "eq", "c")],
    ["una colonna di task tolta da Clienti", f("state", "eq", "chiamare")],
    ["= escluso su testo: gt", f("comune", "gt", "M")],
    ["gt su un enum", f("source", "gt", "inbound")],
    ["un valore fuori dall'enum", f("source", "eq", "inesistente")],
    ["un intero non numerico", f("age", "gt", "abc")],
    ["un intero fuori dal range di smallint", f("age", "gt", "99999")],
    ["un intero con la virgola", f("age", "gt", "4,5")],
    ["un intero in notazione esponenziale", f("age", "gt", "1e3")],
    [
      "una data con un mese che non esiste",
      f("birthday_date", "eq", "2026-13-01"),
    ],
    ["una data dell'anno 0000", f("birthday_date", "lt", "0000-01-01")],
    ["una data in un altro formato", f("birthday_date", "lt", "15/01/2026")],
    ["un testo vuoto", f("occupazione", "eq", "")],
  ])("%s", async (_, invalid) => {
    const { young, list, ids } = await seed()
    expect(await list([invalid, valid])).toEqual(ids(young))
  })

  it("numeri e date valgono dopo il trim, il testo resta com'è", async () => {
    const { middle, list, ids } = await seed()
    expect(await list([f("age", "eq", " 40 ")])).toEqual(ids(middle))
    expect(await list([f("birthday_date", "eq", " 1980-06-15 ")])).toEqual(
      ids(middle)
    )
    // " Milano " con gli spazi non è contenuto in "Milano"
    expect(await list([f("comune", "eq", " Milano ")])).toEqual({
      ids: [],
      total: 0,
    })
  })

  it("solo voci non valide: la lista senza filtri", async () => {
    const { young, middle, old, list, ids } = await seed()
    expect(
      await list([f("state", "eq", "chiamare"), f("age", "gt", "abc")])
    ).toEqual(ids(young, middle, old))
  })
})
