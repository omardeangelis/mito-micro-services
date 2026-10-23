import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContactsTableSection } from "../ContactsTableSection"

// Le colonne nascoste di Contatti arrivano dal cookie della richiesta (AC32)

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  getContacts: vi.fn(),
  getOperators: vi.fn(),
}))

vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }))
vi.mock("@/trpc/server", () => ({
  api: {
    task: { getContacts: { query: mocks.getContacts } },
    operator: { getAllUniqueOperators: { query: mocks.getOperators } },
  },
}))
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = mocks.cookies.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))
vi.mock("../ContactsListShell", () => ({
  ContactsListShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("../ContactFilters", () => ({ ContactFilters: () => null }))
vi.mock("../ContactsTable", () => ({
  ContactsTable: ({ hiddenColumns }: { hiddenColumns: string[] }) => (
    <p data-testid="hidden">{hiddenColumns.join(",")}</p>
  ),
}))

beforeEach(() => {
  mocks.cookies.clear()
  mocks.getContacts.mockReset().mockResolvedValue({
    contacts: [],
    previous: null,
    total: 0,
    customerFilter: null,
  })
  mocks.getOperators.mockReset().mockResolvedValue([])
})

const hiddenFor = async (cookie: string | undefined) => {
  if (cookie !== undefined) mocks.cookies.set("mito-pref-cot", cookie)
  render(await ContactsTableSection({ searchParams: {} }))
  return screen.getByTestId("hidden").textContent
}

describe("ContactsTableSection, colonne nascoste nel cookie (AC32)", () => {
  it("passa alla tabella le colonne nascoste del cookie", async () => {
    expect(await hiddenFor(JSON.stringify(["Telefono", "CF"]))).toBe(
      "Telefono,CF"
    )
  })

  it("senza cookie non nasconde niente", async () => {
    expect(await hiddenFor(undefined)).toBe("")
  })

  it("un cookie illeggibile vale come assente", async () => {
    expect(await hiddenFor("{non json")).toBe("")
  })
})
