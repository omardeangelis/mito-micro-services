import { beforeEach, describe, expect, it, vi } from "vitest"
import { CustomersTableSection } from "../CustomerTableSection"

// Il `search_by` che la pagina Clienti passa al server

const api = vi.hoisted(() => ({
  getAllCustomers: vi.fn<[Record<string, unknown>], Promise<unknown>>(),
  getUserPreference: vi.fn(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    customer: { getAllCustomers: { query: api.getAllCustomers } },
    user: { getUserPreference: { query: api.getUserPreference } },
  },
}))
vi.mock("../CustomersTable", () => ({ CustomersTable: () => null }))
vi.mock("../CustomerColumns", () => ({ CustomerColumns: [] }))

beforeEach(() => {
  api.getAllCustomers.mockReset().mockResolvedValue({
    allCustomers: [],
    total: 0,
  })
  api.getUserPreference.mockReset().mockResolvedValue({ preferences: null })
})

async function queryFor(searchParams: Record<string, string | string[]>) {
  await CustomersTableSection({ searchParams })
  // L'ultima chiamata: un test può interrogare la pagina più volte
  return api.getAllCustomers.mock.calls.at(-1)?.[0]
}

const searchByFor = (search_by: string | string[] | undefined) =>
  queryFor({ q: "Roma", ...(search_by === undefined ? {} : { search_by }) })

describe("CustomersTableSection, search_by", () => {
  it("passa un valore del selettore", async () => {
    expect(await searchByFor("comune")).toMatchObject({
      q: "Roma",
      searchBy: "comune",
    })
  })

  it("assente, sconosciuto o ripetuto cerca per codice fiscale", async () => {
    for (const value of [undefined, "", "address", ["comune", "email"]]) {
      api.getAllCustomers.mockClear()
      expect(await searchByFor(value)).toMatchObject({
        searchBy: "fiscalCode",
      })
    }
  })

  it("con q ripetuto cerca il primo", async () => {
    expect(
      await queryFor({ q: ["Roma", "Milano"], search_by: "comune" })
    ).toMatchObject({ q: "Roma", searchBy: "comune" })
  })
})

// Filtri e ordinamenti tolti da Clienti (AC59, AC60): un link salvato si apre
// senza di loro. I parametri sono quelli veri dell'URL, già decodificati da
// Next: `filter_by=[status]=chiamare` e `filter=state:eq:chiamare`

const savedSqlFilter = async (filter: string | string[]) =>
  ((await queryFor({ filter })) as { sqlFilter: string }).sqlFilter

describe("CustomersTableSection, filtri tolti (AC60)", () => {
  it("scarta il filtro avanzato sullo stato e su 'Contattato il'", async () => {
    expect(await savedSqlFilter("state:eq:chiamare")).toBe("")
    expect(await savedSqlFilter("closed_at:gte:2026-09-01")).toBe("")
  })

  it("tiene i filtri avanzati sulle colonne del cliente accanto a quelli tolti", async () => {
    expect(
      await savedSqlFilter([
        "state:eq:chiamare",
        "comune:eq:Roma",
        "closed_at:gte:2026-09-01",
      ])
    ).toBe("comune ilike '%Roma%'")
  })

  it("non manda più il filtro per stato né quello sulle task", async () => {
    for (const filter_by of [
      "[status]=chiamare",
      "[status]=chiamare-richiamare",
      encodeURIComponent("[status]=chiamare"),
    ]) {
      api.getAllCustomers.mockClear()
      const query = (await queryFor({
        filter_by,
        filter: "state:eq:chiamare",
      })) as { filterBy: Record<string, unknown> }
      expect(query.filterBy).not.toHaveProperty("status")
      expect(query).not.toHaveProperty("sqlTaskFilter")
    }
  })

  it("tiene gli altri filtri di filter_by accanto a quello tolto", async () => {
    expect(
      await queryFor({ filter_by: "[status]=chiamare,[sede]=Roma-Milano" })
    ).toMatchObject({ filterBy: { sede: ["Roma", "Milano"] } })
  })
})

describe("CustomersTableSection, ordinamenti tolti (AC59, AC60)", () => {
  const byDefault = { orderBy: "updatedAt", sortedBy: "desc" }

  it("senza ordinamento nell'URL ordina per ultima modifica, dalla più recente", async () => {
    expect(await queryFor({})).toMatchObject(byDefault)
  })

  it("'contattato' e 'priority' tornano al default, direzione compresa", async () => {
    for (const params of [
      { order_by: "contattato", sorted_by: "asc" },
      { order_by: "contattato" },
      { order_by: "priority", sorted_by: "asc" },
      { order_by: "priority" },
    ] as Record<string, string>[]) {
      api.getAllCustomers.mockClear()
      expect(await queryFor(params)).toMatchObject(byDefault)
    }
  })

  it("un ordinamento che esiste resta", async () => {
    expect(
      await queryFor({ order_by: "name", sorted_by: "asc" })
    ).toMatchObject({ orderBy: "name", sortedBy: "asc" })
    expect(await queryFor({ order_by: "createdAt" })).toMatchObject({
      orderBy: "createdAt",
      sortedBy: "desc",
    })
  })
})

describe("CustomersTableSection, colonne rimosse nelle preferenze", () => {
  const defaultColumnsFor = async (hidden: string[] | undefined) => {
    api.getUserPreference.mockResolvedValue({
      preferences: { customerTableVisibleColumns: hidden },
    })
    const element = (await CustomersTableSection({ searchParams: {} })) as {
      props: { defaultColumns: unknown }
    }
    return element.props.defaultColumns
  }

  it("ignora le tre colonne tolte e tiene le altre nascoste", async () => {
    expect(
      await defaultColumnsFor([
        "Stato Chiamate",
        "Sede",
        "Contattato il",
        "Priorità",
      ])
    ).toEqual({ Sede: false })
  })

  it("con solo colonne tolte non nasconde niente: la tabella non resta vuota", async () => {
    expect(await defaultColumnsFor(["Stato Chiamate", "Priorità"])).toEqual({})
  })

  it("senza preferenze lascia le colonne di default", async () => {
    expect(await defaultColumnsFor(undefined)).toBeUndefined()
  })
})
