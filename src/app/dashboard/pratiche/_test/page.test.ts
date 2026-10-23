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
