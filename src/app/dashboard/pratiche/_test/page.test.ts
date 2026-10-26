import { beforeEach, describe, expect, it, vi } from "vitest"
import ParticheHome from "../page"

// Il `search_by` che la pagina Pratiche passa al server

const api = vi.hoisted(() => ({
  getAllPratiche: vi.fn<[Record<string, unknown>], Promise<unknown>>(),
  cookies: new Map<string, string>(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    pratiche: { getAllPratiche: { query: api.getAllPratiche } },
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
vi.mock("@/app/dashboard/pratiche/_components/PraticesTable", () => ({
  PracticesTable: () => null,
}))
vi.mock("../_components/TableColumn", () => ({ PraticheTableColumns: [] }))

beforeEach(() => {
  api.getAllPratiche.mockReset().mockResolvedValue({ data: [], total: [] })
  api.cookies.clear()
})

describe("pagina Pratiche, search_by", () => {
  it("assente, sconosciuto o ripetuto cerca per ID pratica", async () => {
    for (const search_by of [
      undefined,
      "",
      "region",
      ["praticaId", "region"],
    ]) {
      api.getAllPratiche.mockClear()
      await ParticheHome({
        params: { slug: "" },
        searchParams: { q: "PR-2026", search_by },
      })
      expect(api.getAllPratiche.mock.calls[0]?.[0]).toMatchObject({
        q: "PR-2026",
        searchBy: "praticaId",
      })
    }
  })

  it("con q ripetuto cerca il primo", async () => {
    await ParticheHome({
      params: { slug: "" },
      searchParams: { q: ["PR-2026", "PR-2025"], search_by: "praticaId" },
    })
    expect(api.getAllPratiche.mock.calls[0]?.[0]).toMatchObject({
      q: "PR-2026",
      searchBy: "praticaId",
    })
  })
})

describe("pagina Pratiche, colonne nascoste nel cookie (AC32)", () => {
  const defaultColumnsFor = async (cookie: string | undefined) => {
    api.cookies.clear()
    if (cookie !== undefined) api.cookies.set("mito-pref-pt", cookie)
    const element = (await ParticheHome({
      params: { slug: "" },
      searchParams: {},
    })) as {
      props: { children: { props: { dafaultColumns: unknown } } }
    }
    return element.props.children.props.dafaultColumns
  }

  it("nasconde le colonne del cookie, senza chiedere le preferenze al server", async () => {
    expect(await defaultColumnsFor(JSON.stringify(["Sede"]))).toEqual({
      Sede: false,
    })
  })

  it("un cookie illeggibile vale come assente", async () => {
    expect(await defaultColumnsFor("{non json")).toBeUndefined()
    expect(await defaultColumnsFor(undefined)).toBeUndefined()
  })
})

// I filtri avanzati vanno al server come dati: è lui che scarta le colonne e
// gli operatori che non conosce (AC7, AC8, AC9). La pagina non manda più SQL
// né le tuple grezze dell'URL
describe("pagina Pratiche, filtri avanzati come dati", () => {
  const queryFor = async (filter?: string | string[]) => {
    api.getAllPratiche.mockClear()
    await ParticheHome({
      params: { slug: "" },
      searchParams: filter === undefined ? {} : { filter },
    })
    const query = api.getAllPratiche.mock.calls[0]?.[0] ?? {}
    expect(query).not.toHaveProperty("sqlFilter")
    expect(query).not.toHaveProperty("filter")
    return query.advancedFilters
  }

  it("manda la tupla dell'URL come { field, op, value }", async () => {
    expect(await queryFor("importo_rata:gt:150")).toEqual([
      { field: "importo_rata", op: "gt", value: "150" },
    ])
  })

  it("manda tutte le tuple, anche quelle che il server scarta, e salta le malformate", async () => {
    expect(
      await queryFor([
        "region:eq:Lazio",
        "comune:eq:x') OR ('1'='1",
        "rotto",
        "importo_rata:eq:",
      ])
    ).toEqual([
      { field: "region", op: "eq", value: "Lazio" },
      { field: "comune", op: "eq", value: "x') OR ('1'='1" },
    ])
  })

  it("senza filtri avanzati manda una lista vuota", async () => {
    expect(await queryFor()).toEqual([])
  })
})
