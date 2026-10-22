import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Column } from "@tanstack/react-table"
import { CustomersTable } from "../CustomersTable"
import { CustomerColumns } from "../CustomerColumns"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Tornando su Clienti entro i 30 secondi della router cache, la prop del server
// è quella vecchia: le colonne vengono dallo store (AC32)

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("../../_actions/handleCustomerBlackList", () => ({
  handleCustomerBlackList: vi.fn(),
}))
vi.mock("../TableFilterSections", () => ({
  TableFilterSections: ({
    allColumns,
  }: {
    allColumns: Column<unknown, unknown>[]
  }) => (
    <p data-testid="visible">
      {allColumns
        .filter((column) => column.getIsVisible())
        .map((column) => column.id)
        .join(",")}
    </p>
  ),
}))
vi.mock("../CustomerBulkDialog", () => ({ CustomerBulkDialog: () => null }))
vi.mock("@/components/custom/table/TablePagination", () => ({
  TablePagination: () => null,
}))

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

const mount = (
  preferences: Parameters<typeof createUserPreferenceStore>[0]["preferences"],
  defaultColumns: Record<string, boolean> | undefined
) =>
  render(
    <UserPreferenceContext.Provider
      value={createUserPreferenceStore({
        role: "ADMIN",
        operatorId: 1,
        preferences,
      })}
    >
      <CustomersTable
        columns={CustomerColumns}
        data={[]}
        total={0}
        defaultColumns={defaultColumns}
      />
    </UserPreferenceContext.Provider>
  )

beforeEach(clearCookies)
afterEach(cleanup)

describe("CustomersTable, da dove prende le colonne (AC32)", () => {
  it("lo store vince sulla prop del server, che è quella del render in cache", () => {
    mount({ customerTableVisibleColumns: ["email"] }, {})

    expect(screen.getByTestId("visible").textContent).not.toContain("email")
  })

  it("senza niente nello store parte dalla prop del server", () => {
    mount(undefined, { email: false })

    expect(screen.getByTestId("visible").textContent).not.toContain("email")
  })

  it("una lista che nomina colonne tolte non nasconde niente", () => {
    const before = mount(undefined, {})
    const all = screen.getByTestId("visible").textContent
    before.unmount()

    mount({ customerTableVisibleColumns: ["Priorità", "Contattato il"] }, {})

    expect(screen.getByTestId("visible").textContent).toBe(all)
  })

  it("non scrive nessun cookie solo per essere stata mostrata", () => {
    mount({ customerTableVisibleColumns: ["email"] }, {})

    expect(document.cookie).toBe("")
  })
})
