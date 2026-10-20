import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { migrateUpTo, resetDb, testClient } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
  createTask,
} from "@/test/factories"
import { type CustomerSearchBy } from "@/lib/constants/customerSearch"

// La lista della pagina Clienti: la ricerca (`?q=…&search_by=…`), le pagine,
// gli ordinamenti e i filtri

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const rossi = await createCustomer({
    name: "Mariangela",
    surname: "Rossignoli",
    email: "mariangela.nali+off@example.com",
    phoneNumber: "3331112222",
    fiscalCode: "RSSMNG80A41H501Z",
    comune: "Civitavecchia",
  })
  const bianchi = await createCustomer({
    name: "Gianluca",
    surname: "Bianchetti",
    email: "gian_luca%off@example.org",
    phoneNumber: "3409998888",
    vatCode: "IT01234567890",
    comune: "Sesto San Giovanni",
  })
  const search = async (searchBy: CustomerSearchBy | undefined, q: string) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      searchBy,
      q,
    })
    return { ids: allCustomers.map((c) => c.id), total }
  }
  return { rossi, bianchi, search }
}

describe("customer.getAllCustomers, ricerca", () => {
  it("cerca per codice fiscale e per partita IVA", async () => {
    const { rossi, bianchi, search } = await seed()
    expect(await search("fiscalCode", "rssmng")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
    expect(await search("fiscalCode", "01234567")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("senza search_by cerca per codice fiscale", async () => {
    const { rossi, search } = await seed()
    expect(await search(undefined, "rssmng")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
  })

  it("cerca per nome", async () => {
    const { bianchi, search } = await seed()
    expect(await search("name", "gianl")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca per cognome", async () => {
    const { bianchi, search } = await seed()
    expect(await search("surname", "BIANCH")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca per email", async () => {
    const { rossi, search } = await seed()
    expect(await search("email", "example.com")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
  })

  it("cerca per telefono", async () => {
    const { rossi, search } = await seed()
    expect(await search("phoneNumber", "3331")).toEqual({
      ids: [rossi.id],
      total: 1,
    })
  })

  it("cerca per comune", async () => {
    const { bianchi, search } = await seed()
    expect(await search("comune", "san giov")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("cerca % e _ come testo, non come caratteri jolly", async () => {
    const { bianchi, search } = await seed()
    expect(await search("name", "%")).toEqual({ ids: [], total: 0 })
    expect(await search("name", "_")).toEqual({ ids: [], total: 0 })
    // Come caratteri jolly troverebbero anche "nal" e "+off" di Rossignoli
    expect(await search("email", "n_l")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
    expect(await search("email", "%off")).toEqual({
      ids: [bianchi.id],
      total: 1,
    })
  })

  it("rifiuta un search_by sconosciuto", async () => {
    const { search } = await seed()
    for (const searchBy of ["address", "nome", "telefono"]) {
      await expect(
        search(searchBy as CustomerSearchBy, "Roma")
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    }
  })
})

// Le pagine di Clienti (AC59, AC61): senza il join con la task, ogni pagina ha
// il numero di righe richiesto e l'ordine non dipende dal piano della query

const SAME_DATE = new Date("2026-05-01T10:00:00.000Z")

/** `c-01` … `c-25` */
const customerId = (n: number) => `c-${String(n).padStart(2, "0")}`

/**
 * 25 clienti con lo stesso `updatedAt` (un'assegnazione massiva li scrive tutti
 * insieme) e più pratiche ciascuno. Si inseriscono in un ordine che non è né
 * quello crescente né quello decrescente degli id: un pareggio mancante non
 * cadrebbe, perché l'ordine di inserimento coinciderebbe con quello atteso.
 */
async function seedTwentyFive() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const insertion = Array.from({ length: 25 }, (_, i) => ((i * 7) % 25) + 1)
  for (const n of insertion) {
    const customer = await createCustomer({
      id: customerId(n),
      tempID: customerId(n),
      uniqueHash: customerId(n),
      updatedAt: SAME_DATE,
    })
    // 1, 2 o 3 pratiche: un join con `customerToPratica` ripeterebbe il cliente
    for (let i = 0; i < (n % 3) + 1; i++) {
      await createPractice({ customerId: customer.id })
    }
  }
  const page = async (
    pageNumber: number,
    values: { orderBy?: string; sortedBy?: "asc" | "desc" } = {}
  ) => {
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: pageNumber,
      perPage: 10,
      ...values,
    })
    return { ids: allCustomers.map((c) => c.id), total }
  }
  return { caller, page }
}

const idsDescending = Array.from({ length: 25 }, (_, i) => customerId(25 - i))

describe("customer.getAllCustomers, pagine", () => {
  it("con gli updatedAt uguali le pagine hanno 10, 10 e 5 righe distinte, nell'ordine di id decrescente", async () => {
    const { page } = await seedTwentyFive()
    const pages = [await page(1), await page(2), await page(3)]

    expect(pages.map(({ ids }) => ids.length)).toEqual([10, 10, 5])
    expect(pages.map(({ total }) => total)).toEqual([25, 25, 25])
    expect(pages.flatMap(({ ids }) => ids)).toEqual(idsDescending)
  })

  it("il pareggio segue la direzione dell'ordinamento", async () => {
    const { page } = await seedTwentyFive()
    const ids = [
      ...(await page(1, { orderBy: "updatedAt", sortedBy: "asc" })).ids,
      ...(await page(2, { orderBy: "updatedAt", sortedBy: "asc" })).ids,
      ...(await page(3, { orderBy: "updatedAt", sortedBy: "asc" })).ids,
    ]

    expect(ids).toEqual([...idsDescending].reverse())
  })

  it("una pagina oltre l'ultima è vuota e il totale resta quello dei clienti", async () => {
    const { page } = await seedTwentyFive()

    expect(await page(4)).toEqual({ ids: [], total: 25 })
  })

  it("il totale conta i clienti che soddisfano i filtri, non le loro pratiche", async () => {
    const { caller } = await seedTwentyFive()
    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      sqlFilter: `temp_id like 'c-1%'`,
    })

    expect(total).toBe(10)
    expect(allCustomers.map((c) => c.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => customerId(19 - i))
    )
  })

  it("l'ultima chiave dell'ORDER BY è customers.id", async () => {
    const { caller } = await seedTwentyFive()
    const query = vi.spyOn(testClient, "query")
    try {
      await caller.customer.getAllCustomers({ page: 1, perPage: 10 })
      const sent = query.mock.calls.map(([text]) => String(text))
      const select = sent.find(
        (text) => /order by/i.test(text) && /limit/i.test(text)
      )
      expect(select).toMatch(
        /order by .*"mito-deutsche_customers"\."id" (asc|desc) limit/i
      )
    } finally {
      query.mockRestore()
    }
  })
})

describe("customer.getAllCustomers, ordinamenti", () => {
  async function seedByDate() {
    const operator = await createOperator({ name: "Operatore" })
    const caller = createTestCaller(operator)
    const oldest = await createCustomer({
      updatedAt: new Date("2026-01-01T10:00:00.000Z"),
    })
    const middle = await createCustomer({
      updatedAt: new Date("2026-02-01T10:00:00.000Z"),
    })
    const newest = await createCustomer({
      updatedAt: new Date("2026-03-01T10:00:00.000Z"),
    })
    const ids = async (values: {
      orderBy?: string
      sortedBy?: "asc" | "desc"
    }) =>
      (
        await caller.customer.getAllCustomers({
          page: 1,
          perPage: 10,
          ...values,
        })
      ).allCustomers.map((c) => c.id)
    return { oldest, middle, newest, ids, caller }
  }

  it("senza ordinamento il default è l'ultima modifica, dalla più recente", async () => {
    const { oldest, middle, newest, ids } = await seedByDate()

    expect(await ids({})).toEqual([newest.id, middle.id, oldest.id])
  })

  it("priority, contattato e un ordinamento sconosciuto danno il default, anche con la direzione crescente", async () => {
    const { oldest, middle, newest, ids } = await seedByDate()
    const byDefault = [newest.id, middle.id, oldest.id]

    for (const orderBy of ["priority", "contattato", "status", "toString"]) {
      expect(await ids({ orderBy, sortedBy: "asc" })).toEqual(byDefault)
      expect(await ids({ orderBy, sortedBy: "desc" })).toEqual(byDefault)
      expect(await ids({ orderBy })).toEqual(byDefault)
    }
  })

  it("updatedAt rispetta la direzione richiesta", async () => {
    const { oldest, middle, newest, ids } = await seedByDate()

    expect(await ids({ orderBy: "updatedAt", sortedBy: "asc" })).toEqual([
      oldest.id,
      middle.id,
      newest.id,
    ])
    expect(await ids({ orderBy: "updatedAt", sortedBy: "desc" })).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ])
  })

  it("signedPractices ordina per numero di pratiche e lo restituisce", async () => {
    const { caller } = await seedByDate()
    await createCustomer({ updatedAt: SAME_DATE })
    const one = await createCustomer({ updatedAt: SAME_DATE })
    const three = await createCustomer({ updatedAt: SAME_DATE })
    await createPractice({ customerId: one.id })
    for (let i = 0; i < 3; i++) await createPractice({ customerId: three.id })

    const { allCustomers } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 2,
      orderBy: "signedPractices",
      sortedBy: "desc",
    })
    expect(allCustomers.map((c) => [c.id, c.signedPractices])).toEqual([
      [three.id, 3],
      [one.id, 1],
    ])

    const ascending = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      orderBy: "signedPractices",
      sortedBy: "asc",
    })
    expect(ascending.allCustomers.slice(-2).map((c) => c.id)).toEqual([
      one.id,
      three.id,
    ])
    expect(
      ascending.allCustomers.filter((c) => c.signedPractices === 0)
    ).toHaveLength(4)
  })

  it("ordina per cognome e per operatore, con gli id a pareggio", async () => {
    const { caller } = await seedByDate()
    const anna = await createOperator({ name: "Anna", surname: "Zeta" })
    const [a, b] = [
      await createCustomer({ surname: "Verdi", operatorId: anna.id }),
      await createCustomer({ surname: "Verdi", operatorId: anna.id }),
    ]
    const { allCustomers } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      orderBy: "surname",
      sortedBy: "desc",
    })
    const verdi = allCustomers.filter((c) => c.surname === "Verdi")
    expect(verdi.map((c) => c.id)).toEqual([b.id, a.id].sort().reverse())

    const byOperator = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      orderBy: "operatore",
      sortedBy: "asc",
    })
    expect(
      byOperator.allCustomers.slice(0, 2).map((c) => c.operatore?.name)
    ).toEqual(["Anna", "Anna"])
    expect(byOperator.allCustomers.at(-1)?.operatore).toBeNull()
  })
})

describe("customer.getAllCustomers, senza il contatto", () => {
  it("la riga non porta più i campi della task", async () => {
    const operator = await createOperator({ name: "Operatore" })
    const caller = createTestCaller(operator)
    const customer = await createCustomer({ operatorId: operator.id })
    await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "chiamare",
      priority: 40,
      closedAt: new Date("2026-04-01T10:00:00.000Z"),
    })

    const { allCustomers } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
    })

    expect(allCustomers).toHaveLength(1)
    const [row] = allCustomers
    for (const gone of [
      "tasks",
      "activeTasks",
      "closedAt",
      "priority",
      "taskCustomerId",
    ]) {
      expect(row).not.toHaveProperty(gone)
    }
    expect(row).toMatchObject({
      id: customer.id,
      operatore: { id: operator.id, name: "Operatore" },
      signedPractices: 0,
    })
  })

  it("status e sqlTaskFilter non hanno più effetto", async () => {
    const operator = await createOperator({ name: "Operatore" })
    const caller = createTestCaller(operator)
    const calling = await createCustomer({ operatorId: operator.id })
    const callBack = await createCustomer({ operatorId: operator.id })
    const noContact = await createCustomer()
    await createTask({ customerId: calling.id, state: "chiamare" })
    await createTask({ customerId: callBack.id, state: "richiamare" })

    const input = {
      page: 1,
      perPage: 10,
      filterBy: { status: ["chiamare"] },
      sqlTaskFilter: "state = 'chiamare'",
    } as unknown as Parameters<typeof caller.customer.getAllCustomers>[0]
    const { allCustomers, total } = await caller.customer.getAllCustomers(input)

    expect(allCustomers.map((c) => c.id).sort()).toEqual(
      [calling.id, callBack.id, noContact.id].sort()
    )
    expect(total).toBe(3)
  })

  it("un sqlFilter su una colonna di customers filtra come prima", async () => {
    const operator = await createOperator({ name: "Operatore" })
    const caller = createTestCaller(operator)
    const roma = await createCustomer({ comune: "Roma" })
    await createCustomer({ comune: "Milano" })

    const { allCustomers, total } = await caller.customer.getAllCustomers({
      page: 1,
      perPage: 10,
      sqlFilter: "comune ilike '%Roma%'",
    })

    expect(allCustomers.map((c) => c.id)).toEqual([roma.id])
    expect(total).toBe(1)
  })
})

describe("customer.getAllCustomers, filtri", () => {
  it("'Solo i miei', operatore, non assegnati, sede, ambito, occupazione, file e blacklist danno i clienti di prima", async () => {
    const me = await createOperator({ name: "Io" })
    const other = await createOperator({ name: "Altro" })
    const caller = createTestCaller(me)
    const mine = await createCustomer({
      operatorId: me.id,
      sede: "Roma",
      ambitoLavorativo: "Edilizia",
      occupazione: "Operaio",
      fileName: "file-a.xlsx",
    })
    const theirs = await createCustomer({
      operatorId: other.id,
      sede: "Milano",
      ambitoLavorativo: "Scuola",
      occupazione: "Docente",
      fileName: "file-b.xlsx",
      blackListStatus: "blacklisted",
    })
    const unassigned = await createCustomer({ sede: "Roma" })
    const ids = async (values: Record<string, unknown>) =>
      (
        await caller.customer.getAllCustomers({
          page: 1,
          perPage: 10,
          orderBy: "createdAt",
          sortedBy: "asc",
          ...values,
        })
      ).allCustomers.map((c) => c.id)

    expect(await ids({ onlyMe: true })).toEqual([mine.id])
    expect(await ids({ filterBy: { operatore: other.id } })).toEqual([
      theirs.id,
    ])
    expect(await ids({ filterBy: { operatore: 0 } })).toEqual([unassigned.id])
    expect(await ids({ filterBy: { sede: ["Roma"] } })).toEqual([
      mine.id,
      unassigned.id,
    ])
    expect(await ids({ filterBy: { ambito: ["Scuola"] } })).toEqual([theirs.id])
    expect(await ids({ filterBy: { jobs: ["Operaio"] } })).toEqual([mine.id])
    expect(await ids({ filterBy: { file: "file-b.xlsx" } })).toEqual([
      theirs.id,
    ])
    expect(await ids({ showDM: true })).toEqual([theirs.id])
  })
})
