import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { type CustomerSearchBy } from "@mito/domain/constants/customerSearch"

// Caratterizzazione dei parametri di `customer.getAllCustomers` che le altre
// suite lasciano scoperti: ogni valore noto di `orderBy` (con `sortedBy`
// asc, desc e assente), la precedenza tra `onlyMe` e `filterBy.operatore`, i
// filtri con array vuoti, la colonna in cui cerca ogni `searchBy` e `q` vuota.
// Fotografa il comportamento di oggi.

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type ListInput = Parameters<
  ReturnType<typeof createTestCaller>["customer"]["getAllCustomers"]
>[0]

/** La lista, come ids nell'ordine restituito e totale. */
const listWith =
  (caller: ReturnType<typeof createTestCaller>) =>
  async (values: Partial<ListInput> = {}) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 50,
      ...values,
    })
    return { ids: allCustomers.map((c) => c.id), total }
  }

describe("customer.getAllCustomers, ogni orderBy noto", () => {
  // Tre clienti con id crescenti `ord-a` < `ord-b` < `ord-c`, il cui valore
  // nella colonna ordinata e INVERSO: `ord-a` ha il valore piu alto. Ordinare
  // per id darebbe l'ordine opposto a quello per colonna, in entrambe le
  // direzioni.
  const IDS = ["ord-a", "ord-b", "ord-c"] as const

  type Seeded = Partial<Parameters<typeof createCustomer>[0]>
  /** Per ogni `orderBy`, le colonne dei tre clienti (a, b, c), valore decrescente. */
  const columnValues: Record<string, [Seeded, Seeded, Seeded]> = {
    name: [{ name: "Zeta" }, { name: "Mario" }, { name: "Anna" }],
    surname: [{ surname: "Zeta" }, { surname: "Mario" }, { surname: "Anna" }],
    fiscalCode: [
      { fiscalCode: "ZZZZZZZZZZZZZZZZ" },
      { fiscalCode: "MMMMMMMMMMMMMMMM" },
      { fiscalCode: "AAAAAAAAAAAAAAAA" },
    ],
    email: [
      { email: "z@test.local" },
      { email: "m@test.local" },
      { email: "a@test.local" },
    ],
    phoneNumber: [
      { phoneNumber: "3339990000" },
      { phoneNumber: "3335550000" },
      { phoneNumber: "3331110000" },
    ],
    comune: [{ comune: "Zogno" }, { comune: "Milano" }, { comune: "Ancona" }],
    birthdayDate: [
      { birthdayDate: new Date("1990-01-01T00:00:00.000Z") },
      { birthdayDate: new Date("1980-01-01T00:00:00.000Z") },
      { birthdayDate: new Date("1970-01-01T00:00:00.000Z") },
    ],
    // L'ordine dell'enum e blacklisted < whitelisted < review
    blackListStatus: [
      { blackListStatus: "review" },
      { blackListStatus: "whitelisted" },
      { blackListStatus: "blacklisted" },
    ],
    sede: [{ sede: "Zogno" }, { sede: "Milano" }, { sede: "Ancona" }],
    ambitoLavorativo: [
      { ambitoLavorativo: "Zootecnia" },
      { ambitoLavorativo: "Marketing" },
      { ambitoLavorativo: "Agricoltura" },
    ],
    occupazione: [
      { occupazione: "Zoologo" },
      { occupazione: "Medico" },
      { occupazione: "Architetto" },
    ],
    createdAt: [
      { createdAt: new Date("2026-03-01T10:00:00.000Z") },
      { createdAt: new Date("2026-02-01T10:00:00.000Z") },
      { createdAt: new Date("2026-01-01T10:00:00.000Z") },
    ],
    updatedAt: [
      { updatedAt: new Date("2026-03-01T10:00:00.000Z") },
      { updatedAt: new Date("2026-02-01T10:00:00.000Z") },
      { updatedAt: new Date("2026-01-01T10:00:00.000Z") },
    ],
  }

  /** I tre clienti, il loro caller e il numero di pratiche e l'operatore. */
  const seedOrdered = async (orderBy: string) => {
    const caller = createTestCaller(await createOperator({ name: "Chiamante" }))
    if (orderBy === "operatore") {
      // L'ordine e per il nome dell'operatore: a ha quello piu alto
      const names = ["Zeta", "Mario", "Anna"]
      for (const [i, id] of IDS.entries()) {
        const operator = await createOperator({ name: names[i]! })
        await createCustomer({ id, operatorId: operator.id })
      }
    } else if (orderBy === "signedPractices") {
      // a ha 3 pratiche, b 2, c 1
      for (const [i, id] of IDS.entries()) {
        await createCustomer({ id })
        for (let n = 0; n < 3 - i; n++) {
          await createPractice({ customerId: id })
        }
      }
    } else {
      for (const [i, id] of IDS.entries()) {
        await createCustomer({ id, ...columnValues[orderBy]![i] })
      }
    }
    return listWith(caller)
  }

  const orderBys = [
    ...Object.keys(columnValues),
    "operatore",
    "signedPractices",
  ]
  const ascending = [...IDS].reverse()
  const descending = [...IDS]

  it.each(orderBys)(
    "orderBy %s: asc dal valore piu basso, desc dal piu alto, senza sortedBy come asc",
    async (orderBy) => {
      const list = await seedOrdered(orderBy)

      expect(await list({ orderBy, sortedBy: "asc" })).toEqual({
        ids: ascending,
        total: 3,
      })
      expect(await list({ orderBy, sortedBy: "desc" })).toEqual({
        ids: descending,
        total: 3,
      })
      // Senza `sortedBy` la direzione e crescente (non il default decrescente
      // dell'ultima modifica)
      expect(await list({ orderBy })).toEqual({ ids: ascending, total: 3 })
    }
  )
})

describe("customer.getAllCustomers, onlyMe e filterBy.operatore", () => {
  const seedOperators = async () => {
    const me = await createOperator({ name: "Io" })
    const other = await createOperator({ name: "Altro" })
    const mine = await createCustomer({ id: "c-mio", operatorId: me.id })
    const theirs = await createCustomer({ id: "c-loro", operatorId: other.id })
    const unassigned = await createCustomer({ id: "c-libero" })
    return {
      me,
      other,
      mine,
      theirs,
      unassigned,
      list: listWith(createTestCaller(me)),
    }
  }

  it("onlyMe vince su filterBy.operatore di un altro operatore: restano solo i clienti di chi chiama", async () => {
    const { other, mine, list } = await seedOperators()

    expect(
      await list({ onlyMe: true, filterBy: { operatore: other.id } })
    ).toEqual({ ids: [mine.id], total: 1 })
  })

  it("onlyMe con filterBy.operatore uguale a chi chiama da gli stessi clienti", async () => {
    const { me, mine, list } = await seedOperators()

    expect(
      await list({ onlyMe: true, filterBy: { operatore: me.id } })
    ).toEqual({ ids: [mine.id], total: 1 })
  })

  it("filterBy.operatore 0 (non assegnati) vince su onlyMe: restano solo i clienti senza operatore", async () => {
    const { unassigned, list } = await seedOperators()

    expect(await list({ onlyMe: true, filterBy: { operatore: 0 } })).toEqual({
      ids: [unassigned.id],
      total: 1,
    })
  })

  it("con onlyMe falso, filterBy.operatore 0 da i non assegnati e filterBy.operatore un altro operatore da i suoi", async () => {
    const { other, theirs, unassigned, list } = await seedOperators()

    expect(await list({ onlyMe: false, filterBy: { operatore: 0 } })).toEqual({
      ids: [unassigned.id],
      total: 1,
    })
    expect(
      await list({ onlyMe: false, filterBy: { operatore: other.id } })
    ).toEqual({ ids: [theirs.id], total: 1 })
  })

  it("senza onlyMe e senza filterBy.operatore non filtra per operatore", async () => {
    const { list } = await seedOperators()

    const { ids, total } = await list({ filterBy: {} })

    expect([...ids].sort()).toEqual(["c-libero", "c-loro", "c-mio"])
    expect(total).toBe(3)
  })
})

describe("customer.getAllCustomers, filtri con array vuoti", () => {
  it.each<[string, NonNullable<ListInput["filterBy"]>]>([
    ["sede", { sede: [] }],
    ["ambito", { ambito: [] }],
    ["jobs", { jobs: [] }],
  ])(
    "filterBy.%s vuoto non filtra: tornano tutti i clienti, anche quelli senza il valore",
    async (_name, filterBy) => {
      const caller = createTestCaller(await createOperator())
      await createCustomer({
        id: "c-1",
        sede: "Roma",
        ambitoLavorativo: "Edilizia",
        occupazione: "Operaio",
      })
      await createCustomer({
        id: "c-2",
        sede: "Milano",
        ambitoLavorativo: "Scuola",
        occupazione: "Docente",
      })
      await createCustomer({ id: "c-3" })

      const { ids, total } = await listWith(caller)({ filterBy })

      expect([...ids].sort()).toEqual(["c-1", "c-2", "c-3"])
      expect(total).toBe(3)
    }
  )

  it("tutti e tre vuoti insieme non filtrano; con un valore, filtra solo quello", async () => {
    const caller = createTestCaller(await createOperator())
    await createCustomer({ id: "c-1", sede: "Roma", occupazione: "Operaio" })
    await createCustomer({ id: "c-2", sede: "Milano", occupazione: "Docente" })
    const list = listWith(caller)

    const all = await list({ filterBy: { sede: [], ambito: [], jobs: [] } })
    expect([...all.ids].sort()).toEqual(["c-1", "c-2"])
    expect(all.total).toBe(2)

    expect(
      await list({ filterBy: { sede: ["Roma"], ambito: [], jobs: [] } })
    ).toEqual({ ids: ["c-1"], total: 1 })
  })
})

describe("customer.getAllCustomers, la colonna in cui cerca ogni searchBy", () => {
  const NEEDLE = "zqx7"
  // Una colonna per cliente, ciascuna con il testo cercato (maiuscolo: la
  // ricerca ignora le maiuscole) e nessun'altra: un `searchBy` che cercasse
  // anche in un'altra colonna troverebbe un cliente in piu
  const columns = [
    "name",
    "surname",
    "email",
    "phoneNumber",
    "comune",
    "fiscalCode",
    "vatCode",
    "sede",
    "fullName",
    "address",
  ] as const
  const needleIn = (column: (typeof columns)[number]) => ({
    [column]: `xx${NEEDLE.toUpperCase()}xx`,
  })

  // Il codice fiscale cerca anche nella partita IVA, nient'altro
  const searchedColumns: Record<CustomerSearchBy, string[]> = {
    fiscalCode: ["fiscalCode", "vatCode"],
    name: ["name"],
    surname: ["surname"],
    email: ["email"],
    phoneNumber: ["phoneNumber"],
    comune: ["comune"],
  }

  it.each(Object.keys(searchedColumns) as CustomerSearchBy[])(
    "searchBy %s trova il testo solo nelle sue colonne e non negli altri campi del cliente",
    async (searchBy) => {
      const caller = createTestCaller(await createOperator())
      for (const column of columns) {
        await createCustomer({ id: `in-${column}`, ...needleIn(column) })
      }
      // Un cliente che non contiene il testo da nessuna parte
      await createCustomer({ id: "in-nessuna" })

      const { ids, total } = await listWith(caller)({ searchBy, q: NEEDLE })

      const expected = searchedColumns[searchBy].map((c) => `in-${c}`).sort()
      expect([...ids].sort()).toEqual(expected)
      expect(total).toBe(expected.length)
    }
  )

  it.each(Object.keys(searchedColumns) as CustomerSearchBy[])(
    "searchBy %s con q vuota non filtra: tornano tutti i clienti, anche quelli con la colonna cercata a null",
    async (searchBy) => {
      const caller = createTestCaller(await createOperator())
      await createCustomer({
        id: "c-pieno",
        name: "Anna",
        surname: "Rossi",
        email: "a@test.local",
        phoneNumber: "3331112222",
        comune: "Roma",
        fiscalCode: "RSSNNA80A41H501Z",
      })
      // Tutte le colonne cercate a null: `ilike` su null non li troverebbe
      await createCustomer({ id: "c-vuoto" })

      const { ids, total } = await listWith(caller)({ searchBy, q: "" })

      expect([...ids].sort()).toEqual(["c-pieno", "c-vuoto"])
      expect(total).toBe(2)
    }
  )

  it("una q di soli spazi non viene ridotta a vuota: cerca gli spazi come testo", async () => {
    const caller = createTestCaller(await createOperator())
    await createCustomer({ id: "c-due-nomi", name: "Anna Maria" })
    await createCustomer({ id: "c-un-nome", name: "Bruno" })
    await createCustomer({ id: "c-senza-nome", name: null })

    expect(await listWith(caller)({ searchBy: "name", q: " " })).toEqual({
      ids: ["c-due-nomi"],
      total: 1,
    })
  })
})
