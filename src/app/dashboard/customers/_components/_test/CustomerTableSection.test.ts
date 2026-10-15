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

async function searchByFor(search_by: string | string[] | undefined) {
  await CustomersTableSection({ searchParams: { q: "Roma", search_by } })
  return api.getAllCustomers.mock.calls[0]?.[0]
}

describe("CustomersTableSection, search_by", () => {
  it("passa un valore del selettore", async () => {
    expect(await searchByFor("comune")).toMatchObject({
      q: "Roma",
      searchBy: "comune",
    })
  })

  it("assente, sconosciuto o ripetuto cerca per codice fiscale", async () => {
    for (const value of [undefined, "address", ["comune", "email"]]) {
      api.getAllCustomers.mockClear()
      expect(await searchByFor(value)).toMatchObject({
        searchBy: "fiscalCode",
      })
    }
  })
})
