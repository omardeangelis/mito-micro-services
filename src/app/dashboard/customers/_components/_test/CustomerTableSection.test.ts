import { beforeEach, describe, expect, it, vi } from "vitest"
import { CustomersTableSection } from "../CustomerTableSection"

// Il `search_by` che la pagina Clienti passa al server

const api = vi.hoisted(() => ({
  getAllCustomers:
    vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(),
  // The cookies of the request, by name: the layout preferences are in them
  cookies: new Map<string, string>(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    customer: { getAllCustomers: { query: api.getAllCustomers } },
  },
}))
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = api.cookies.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))
vi.mock("../CustomersTable", () => ({ CustomersTable: () => null }))
vi.mock("../CustomerColumns", () => ({ CustomerColumns: [] }))

beforeEach(() => {
  api.getAllCustomers.mockReset().mockResolvedValue({
    allCustomers: [],
    total: 0,
  })
  api.cookies.clear()
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
// Next: `filter_by=[status]=chiamare` e `filter=state:eq:chiamare`.
// I filtri avanzati vanno al server come dati: è lui che scarta le colonne e
// gli operatori che non conosce (AC7, AC8). La pagina non manda più SQL

const sentAdvancedFilters = async (filter: string | string[]) => {
  const query = (await queryFor({ filter }))!
  expect(query).not.toHaveProperty("sqlFilter")
  return query.advancedFilters
}

describe("CustomersTableSection, filtri avanzati come dati (AC9, AC60)", () => {
  it("manda la tupla dell'URL come { field, op, value }", async () => {
    expect(await sentAdvancedFilters("comune:eq:Roma")).toEqual([
      { field: "comune", op: "eq", value: "Roma" },
    ])
  })

  it("senza filtri avanzati manda una lista vuota e nessun SQL", async () => {
    const query = (await queryFor({}))!
    expect(query).not.toHaveProperty("sqlFilter")
    expect(query.advancedFilters).toEqual([])
  })

  it("manda anche i filtri sullo stato e su 'Contattato il', che il server scarta", async () => {
    expect(
      await sentAdvancedFilters([
        "state:eq:chiamare",
        "comune:eq:Roma",
        "closed_at:gte:2026-09-01",
      ])
    ).toEqual([
      { field: "state", op: "eq", value: "chiamare" },
      { field: "comune", op: "eq", value: "Roma" },
      { field: "closed_at", op: "gte", value: "2026-09-01" },
    ])
  })

  it("un nome di colonna a forma di iniezione resta un dato", async () => {
    expect(
      await sentAdvancedFilters([
        "1=1) OR (1:eq:x",
        "comune ilike '%' OR 1=1 --:eq:x",
        "__proto__:eq:x",
        "constructor:eq:x",
      ])
    ).toEqual([
      { field: "1=1) OR (1", op: "eq", value: "x" },
      { field: "comune ilike '%' OR 1=1 --", op: "eq", value: "x" },
      { field: "__proto__", op: "eq", value: "x" },
      { field: "constructor", op: "eq", value: "x" },
    ])
  })

  it("salta le tuple malformate e tiene le prime tre parti, come il popover", async () => {
    expect(
      await sentAdvancedFilters(["rotto", "comune:eq:", "age:gt:10:30"])
    ).toEqual([{ field: "age", op: "gt", value: "10" }])
  })
})

describe("CustomersTableSection, filtri tolti (AC60)", () => {
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

  it("un ordinamento a più colonne con una tolta torna al default, con le direzioni", async () => {
    for (const params of [
      { order_by: "name,priority", sorted_by: "asc,desc" },
      { order_by: "contattato,name", sorted_by: "asc,asc" },
    ]) {
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

describe("CustomersTableSection, colonne nascoste nel cookie (AC32, AC33)", () => {
  const defaultColumnsFor = async (cookie: string | undefined) => {
    api.cookies.clear()
    // Next gives the value of a cookie already decoded
    if (cookie !== undefined) api.cookies.set("mito-pref-ct", cookie)
    const element = (await CustomersTableSection({ searchParams: {} })) as {
      props: { defaultColumns: unknown }
    }
    return element.props.defaultColumns
  }

  it("nasconde le colonne del cookie, senza chiedere le preferenze al server", async () => {
    expect(await defaultColumnsFor(JSON.stringify(["Sede", "Email"]))).toEqual({
      Sede: false,
      Email: false,
    })
  })

  it("ignora le tre colonne tolte e tiene le altre nascoste", async () => {
    expect(
      await defaultColumnsFor(
        JSON.stringify(["Stato Chiamate", "Sede", "Contattato il", "Priorità"])
      )
    ).toEqual({ Sede: false })
  })

  it("con solo colonne tolte non nasconde niente: la tabella non resta vuota", async () => {
    expect(
      await defaultColumnsFor(JSON.stringify(["Stato Chiamate", "Priorità"]))
    ).toEqual({})
  })

  it("senza cookie lascia le colonne di default", async () => {
    expect(await defaultColumnsFor(undefined)).toBeUndefined()
  })

  it.each(["{non json", '"Sede"', "[1, 2]", '{"Sede":true}'])(
    "un cookie illeggibile (%s) vale come assente: nessuna colonna nascosta",
    async (cookie) => {
      expect(await defaultColumnsFor(cookie)).toBeUndefined()
    }
  )
})
