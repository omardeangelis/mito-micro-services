import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { db } from "@mito/db"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { migrateUpTo, resetDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { type PraticaSearchBy } from "@mito/domain/constants/praticaSearch"

// La ricerca della pagina Pratiche (`?q=…&search_by=…`)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

async function seed() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const customer = await createCustomer()
  const cercata = await createPractice({
    customerId: customer.id,
    praticaId: "PR-2026-0451",
  })
  await createPractice({ customerId: customer.id, praticaId: "PR-2025-0910" })
  const conSimboli = await createPractice({
    customerId: customer.id,
    praticaId: "PR_2024%0077",
  })
  const search = async (q: string, searchBy?: PraticaSearchBy) => {
    const { data, total } = await caller.pratiche.getAllPratiche({
      page: 1,
      perPage: 10,
      searchBy,
      q,
      filter: undefined,
    })
    return { praticaIds: data.map((p) => p.praticaId), total }
  }
  return { cercata, conSimboli, search }
}

describe("pratiche.getAllPratiche, ricerca", () => {
  it("cerca per ID pratica", async () => {
    const { cercata, search } = await seed()
    expect(await search("2026-04", "praticaId")).toEqual({
      praticaIds: [cercata.praticaId],
      total: [{ total: 1 }],
    })
  })

  it("senza search_by cerca per ID pratica", async () => {
    const { cercata, search } = await seed()
    expect(await search("pr-2026")).toEqual({
      praticaIds: [cercata.praticaId],
      total: [{ total: 1 }],
    })
  })

  it("cerca % e _ come testo, non come caratteri jolly", async () => {
    const { conSimboli, search } = await seed()
    // Come caratteri jolly troverebbero tutte e tre le pratiche
    expect(await search("%")).toEqual({
      praticaIds: [conSimboli.praticaId],
      total: [{ total: 1 }],
    })
    expect(await search("PR_")).toEqual({
      praticaIds: [conSimboli.praticaId],
      total: [{ total: 1 }],
    })
  })

  it("rifiuta un search_by sconosciuto", async () => {
    const { search } = await seed()
    await expect(
      search("Roma", "region" as PraticaSearchBy)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

// Caratterizzazione di `getAllPratiche` fuori dai filtri avanzati: fissa i
// risultati di oggi (dati, `total`, ordine) prima del passaggio a Effect

type GetAllPratiche = ReturnType<
  typeof createTestCaller
>["pratiche"]["getAllPratiche"]
type ListInput = Omit<Parameters<GetAllPratiche>[0], "filter" | "sqlFilter">

// Le chiamate nuove non nominano `filter` né `sqlFilter`: `filter` è una chiave
// obbligatoria del tipo, ma zod accetta anche che manchi
const list = (
  caller: { pratiche: { getAllPratiche: GetAllPratiche } },
  input: ListInput
) => caller.pratiche.getAllPratiche(input as Parameters<GetAllPratiche>[0])

// Ogni chiave di ordinamento ha valori distinti tra le cinque pratiche, così
// nessun ordine dipende da come il database risolve i pari merito.
// Posizione di ogni pratica (1 = prima in ordine crescente):
//   praticaId          P1 P2 P3 P4 P5
//   productId          P2 P5 P1 P4 P3
//   importoFinanziato  P4 P2 P3 P1 P5
//   importoErogato     P4 P2 P5 P3 P1
//   dataLiquidazione   P2 P4 P1 P5 P3
//   stato              P1 P5 P3 P4 P2
//   importoRata        P5 P3 P2 P4 P1
//   rateTotali         P3 P1 P4 P5 P2
//   ratePagate         P4 P2 P3 P1 P5
//   updatedAt          P5 P3 P2 P1 P4
//   createdAt          P3 P1 P2 P4 P5
async function seedCaratterizzazione() {
  const operator = await createOperator({ name: "Operatore" })
  const caller = createTestCaller(operator)
  const admin = await createOperator({ name: "Admin", role: "ADMIN" })
  const adminCaller = createTestCaller(admin)
  const anna = await createCustomer()
  const luca = await createCustomer()
  const p1 = await createPractice({
    customerId: anna.id,
    praticaId: "PR-001",
    productId: "20",
    importoFinanziato: "30000",
    importoErogato: "29000",
    dataLiquidazione: new Date("2026-03-10T00:00:00.000Z"),
    state: "Liquidata",
    importoRata: "500",
    rateTotali: 24,
    ratePagate: 10,
    fileName: "a.csv",
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    createdAt: new Date("2026-02-03T00:00:00.000Z"),
  })
  const p2 = await createPractice({
    customerId: anna.id,
    praticaId: "PR-002",
    productId: "01",
    importoFinanziato: "10000",
    importoErogato: "9500",
    dataLiquidazione: new Date("2026-01-05T00:00:00.000Z"),
    state: "Stornata",
    importoRata: "200",
    rateTotali: 60,
    ratePagate: 3,
    fileName: "b.csv",
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    createdAt: new Date("2026-03-04T00:00:00.000Z"),
  })
  // Due clienti: compare una volta sola
  const p3 = await createPractice({
    customerId: anna.id,
    praticaId: "PR-003",
    productId: "27",
    importoFinanziato: "20000",
    importoErogato: "21000",
    dataLiquidazione: new Date("2026-05-20T00:00:00.000Z"),
    state: "Chiusa",
    importoRata: "100",
    rateTotali: 12,
    ratePagate: 7,
    fileName: "a.csv",
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
  })
  await db.insert(customerToPratica).values({
    customerId: luca.id,
    praticaId: p3.praticaId,
    customerRole: "Coobbligato",
  })
  const p4 = await createPractice({
    customerId: anna.id,
    praticaId: "PR-004",
    productId: "24",
    importoFinanziato: "5000",
    importoErogato: "4000",
    dataLiquidazione: new Date("2026-02-14T00:00:00.000Z"),
    state: "Rinunciata",
    importoRata: "300",
    rateTotali: 36,
    ratePagate: 1,
    fileName: "b.csv",
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
  })
  const p5 = await createPractice({
    customerId: anna.id,
    praticaId: "PR-005",
    productId: "13",
    importoFinanziato: "40000",
    importoErogato: "15000",
    dataLiquidazione: new Date("2026-04-02T00:00:00.000Z"),
    state: "Rifiutata",
    importoRata: "50",
    rateTotali: 48,
    ratePagate: 20,
    fileName: "c.csv",
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    createdAt: new Date("2026-05-06T00:00:00.000Z"),
  })
  const ids = (result: { data: { praticaId: string }[] }) =>
    result.data.map((p) => p.praticaId)
  return { caller, adminCaller, ids, p1, p2, p3, p4, p5 }
}

describe("pratiche.getAllPratiche, caratterizzazione", () => {
  describe("pagine e total", () => {
    it("senza filtri restituisce tutte le pratiche in ordine di updatedAt crescente", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, { page: 1, perPage: 10 })
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
      expect(result.total).toEqual([{ total: 5 }])
    })

    it("pagina per perPage e page, con lo stesso total", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const first = await list(caller, { page: 1, perPage: 2 })
      const second = await list(caller, { page: 2, perPage: 2 })
      const third = await list(caller, { page: 3, perPage: 2 })
      const fourth = await list(caller, { page: 4, perPage: 2 })
      expect(ids(first)).toEqual(["PR-005", "PR-003"])
      expect(ids(second)).toEqual(["PR-002", "PR-001"])
      expect(ids(third)).toEqual(["PR-004"])
      expect(ids(fourth)).toEqual([])
      for (const page of [first, second, third, fourth]) {
        expect(page.total).toEqual([{ total: 5 }])
      }
    })

    it("total conta anche la pratica senza clienti, che non compare in data", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      await db.insert(practices).values({
        praticaId: "PR-006",
        importoFinanziato: "1000",
        importoErogato: "1000",
        rateTotali: 12,
        importoRata: "100",
        ratePagate: 0,
        dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
        state: "Liquidata",
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      })
      const result = await list(caller, { page: 1, perPage: 10 })
      expect(result.total).toEqual([{ total: 6 }])
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
    })

    it("una pratica con due clienti compare una volta sola", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, { page: 1, perPage: 10 })
      expect(ids(result).filter((id) => id === "PR-003")).toEqual(["PR-003"])
      expect(result.data).toHaveLength(5)
    })
  })

  describe("ordinamento", () => {
    // [orderBy, praticaId in ordine crescente]
    const crescenti: [string, string[]][] = [
      ["praticaId", ["PR-001", "PR-002", "PR-003", "PR-004", "PR-005"]],
      ["productId", ["PR-002", "PR-005", "PR-001", "PR-004", "PR-003"]],
      ["importoFinanziato", ["PR-004", "PR-002", "PR-003", "PR-001", "PR-005"]],
      ["importoErogato", ["PR-004", "PR-002", "PR-005", "PR-003", "PR-001"]],
      ["dataLiquidazione", ["PR-002", "PR-004", "PR-001", "PR-005", "PR-003"]],
      ["stato", ["PR-001", "PR-005", "PR-003", "PR-004", "PR-002"]],
      ["importoRata", ["PR-005", "PR-003", "PR-002", "PR-004", "PR-001"]],
      ["rateTotali", ["PR-003", "PR-001", "PR-004", "PR-005", "PR-002"]],
      ["ratePagate", ["PR-004", "PR-002", "PR-003", "PR-001", "PR-005"]],
      ["updatedAt", ["PR-005", "PR-003", "PR-002", "PR-001", "PR-004"]],
      ["createdAt", ["PR-003", "PR-001", "PR-002", "PR-004", "PR-005"]],
    ]

    it.each(crescenti)(
      "orderBy %s ordina in modo crescente",
      async (orderBy, attesi) => {
        const { caller, ids } = await seedCaratterizzazione()
        const result = await list(caller, {
          page: 1,
          perPage: 10,
          orderBy,
          sortedBy: "asc",
        })
        expect(ids(result)).toEqual(attesi)
      }
    )

    it.each(crescenti)(
      "orderBy %s con sortedBy desc ordina al contrario",
      async (orderBy, attesi) => {
        const { caller, ids } = await seedCaratterizzazione()
        const result = await list(caller, {
          page: 1,
          perPage: 10,
          orderBy,
          sortedBy: "desc",
        })
        expect(ids(result)).toEqual([...attesi].reverse())
      }
    )

    it("senza sortedBy ordina in modo crescente", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        orderBy: "praticaId",
      })
      expect(ids(result)).toEqual([
        "PR-001",
        "PR-002",
        "PR-003",
        "PR-004",
        "PR-005",
      ])
    })

    it("sortedBy desc senza orderBy ordina per updatedAt decrescente", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        sortedBy: "desc",
      })
      expect(ids(result)).toEqual([
        "PR-004",
        "PR-001",
        "PR-002",
        "PR-003",
        "PR-005",
      ])
    })

    it("un orderBy sconosciuto ordina per updatedAt", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        orderBy: "colonnaInventata",
      })
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
    })

    it("ordina prima di paginare", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const second = await list(caller, {
        page: 2,
        perPage: 2,
        orderBy: "praticaId",
        sortedBy: "desc",
      })
      expect(ids(second)).toEqual(["PR-003", "PR-002"])
    })
  })

  describe("filterBy", () => {
    it("filtra per stato", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { state: "Chiusa" },
      })
      expect(ids(result)).toEqual(["PR-003"])
      expect(result.total).toEqual([{ total: 1 }])
    })

    it("filtra per file", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { file: "a.csv" },
      })
      expect(ids(result)).toEqual(["PR-003", "PR-001"])
      expect(result.total).toEqual([{ total: 2 }])
    })

    it("un file sconosciuto non trova nulla", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { file: "assente.csv" },
      })
      expect(ids(result)).toEqual([])
      expect(result.total).toEqual([{ total: 0 }])
    })

    it("filtra per un prodotto, dato per nome", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "ARREDAMENTO" },
      })
      expect(ids(result)).toEqual(["PR-004"])
      expect(result.total).toEqual([{ total: 1 }])
    })

    it("filtra per più prodotti separati da -", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "PRESTITO PERSONALE-ARREDAMENTO" },
      })
      expect(ids(result)).toEqual(["PR-002", "PR-004"])
      expect(result.total).toEqual([{ total: 2 }])
    })

    it("un prodotto sconosciuto non trova nulla", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "NON ESISTE" },
      })
      expect(ids(result)).toEqual([])
      expect(result.total).toEqual([{ total: 0 }])
    })

    it("un prodotto sconosciuto accanto a uno noto viene ignorato", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "ARREDAMENTO-NON ESISTE" },
      })
      expect(ids(result)).toEqual(["PR-004"])
      expect(result.total).toEqual([{ total: 1 }])
    })

    it("il prodotto si dà per nome, non per codice", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "01" },
      })
      expect(ids(result)).toEqual([])
      expect(result.total).toEqual([{ total: 0 }])
    })

    it("un filtro vuoto non filtra", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { productId: "", file: "", state: undefined },
      })
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
      expect(result.total).toEqual([{ total: 5 }])
    })

    it("combina stato, file e prodotto", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: {
          state: "Liquidata",
          file: "a.csv",
          productId: "AUTOMOTIVE NUOVO",
        },
      })
      expect(ids(result)).toEqual(["PR-001"])
      expect(result.total).toEqual([{ total: 1 }])
    })

    it("combina i filtri con la ricerca", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { file: "b.csv" },
        q: "004",
      })
      expect(ids(result)).toEqual(["PR-004"])
      expect(result.total).toEqual([{ total: 1 }])
    })

    it("onlyMe false non filtra", async () => {
      const { caller, ids } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        filterBy: { onlyMe: false },
      })
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
      expect(result.total).toEqual([{ total: 5 }])
    })

    it("onlyMe true chiamato da un ADMIN non filtra", async () => {
      const { adminCaller, ids } = await seedCaratterizzazione()
      const result = await list(adminCaller, {
        page: 1,
        perPage: 10,
        filterBy: { onlyMe: true },
      })
      expect(ids(result)).toEqual([
        "PR-005",
        "PR-003",
        "PR-002",
        "PR-001",
        "PR-004",
      ])
      expect(result.total).toEqual([{ total: 5 }])
    })
  })

  describe("forma della risposta", () => {
    it("restituisce total come [{ total }] e le colonne di una riga di data", async () => {
      const { caller, p1 } = await seedCaratterizzazione()
      const result = await list(caller, {
        page: 1,
        perPage: 10,
        orderBy: "praticaId",
      })
      expect(Object.keys(result).sort()).toEqual(["data", "total"])
      expect(result.total).toEqual([{ total: 5 }])
      expect(typeof result.total[0]!.total).toBe("number")
      expect(result.data[0]).toEqual({
        id: p1.id,
        praticaId: "PR-001",
        productId: "20",
        // castAsNumber cambia solo il tipo TypeScript: a runtime resta la stringa
        importoFinanziato: "30000",
        importoErogato: "29000",
        dataLiquidazione: new Date("2026-03-10T00:00:00.000Z"),
        stato: "Liquidata",
        importoRata: "500",
        rateTotali: 24,
        ratePagate: 10,
        updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        createdAt: new Date("2026-02-03T00:00:00.000Z"),
      })
    })
  })

  describe("errori", () => {
    it("onlyMe true chiamato da un OPERATORE è un INTERNAL_SERVER_ERROR", async () => {
      const { caller } = await seedCaratterizzazione()
      await expect(
        list(caller, { page: 1, perPage: 10, filterBy: { onlyMe: true } })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    })

    it("orderBy operatore è un INTERNAL_SERVER_ERROR", async () => {
      const { caller } = await seedCaratterizzazione()
      await expect(
        list(caller, { page: 1, perPage: 10, orderBy: "operatore" })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    })
  })
})
