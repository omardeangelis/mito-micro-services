import { beforeEach, describe, expect, it, vi } from "vitest"
import ParticheHome from "../page"

// Il `search_by` che la pagina Pratiche passa al server

const api = vi.hoisted(() => ({
  getAllPratiche: vi.fn<[Record<string, unknown>], Promise<unknown>>(),
  getUserPreference: vi.fn(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    pratiche: { getAllPratiche: { query: api.getAllPratiche } },
    user: { getUserPreference: { query: api.getUserPreference } },
  },
}))
vi.mock("@/app/dashboard/pratiche/_components/PraticesTable", () => ({
  PracticesTable: () => null,
}))
vi.mock("../_components/TableColumn", () => ({ PraticheTableColumns: [] }))

beforeEach(() => {
  api.getAllPratiche.mockReset().mockResolvedValue({ data: [], total: [] })
  api.getUserPreference.mockReset().mockResolvedValue({ preferences: null })
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
