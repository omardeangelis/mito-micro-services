import React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Column } from "@tanstack/react-table"
import { CustomersTable } from "../CustomersTable"
import {
  CustomerColumns,
  type CustomerColumnSelectedProps,
} from "../CustomerColumns"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Le colonne nascoste di Clienti restano nel browser, in un cookie: nessuna
// richiesta al server per una scelta di layout (AC31)

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("../../_actions/handleCustomerBlackList", () => ({
  handleCustomerBlackList: vi.fn(),
}))

// The menu of the columns, reduced to what the test needs: the visible
// columns and a way to hide one
vi.mock("../TableFilterSections", () => ({
  TableFilterSections: ({
    allColumns,
  }: {
    allColumns: Column<unknown, unknown>[]
  }) => (
    <div>
      <p data-testid="visible">
        {allColumns
          .filter((column) => column.getIsVisible())
          .map((column) => column.id)
          .join(",")}
      </p>
      <button
        onClick={() =>
          allColumns
            .find((column) => column.id === "email")!
            .toggleVisibility(false)
        }
      >
        nascondi email
      </button>
    </div>
  ),
}))
vi.mock("../CustomerBulkDialog", () => ({ CustomerBulkDialog: () => null }))
vi.mock("@/components/custom/table/TablePagination", () => ({
  TablePagination: () => null,
}))

const customer = {
  id: "customer-1",
  name: "Mario",
  surname: "Rossi",
  fiscalCode: "RSSMRA80A01H501U",
  blackListStatus: "whitelisted",
  signedPractices: 0,
  createdAt: new Date("2026-01-10T10:00:00Z"),
  updatedAt: new Date("2026-02-10T10:00:00Z"),
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
  tasks: null,
} as unknown as CustomerColumnSelectedProps

/** The value of the cookie `name` in the browser, as the page wrote it. */
const cookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

const fetchSpy = vi.fn()

beforeEach(() => {
  clearCookies()
  fetchSpy.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("CustomersTable, colonne nascoste nel cookie (AC31)", () => {
  it("nascondere una colonna la toglie dalla tabella e scrive il cookie senza nessuna fetch", async () => {
    const store = createUserPreferenceStore({ role: "ADMIN", operatorId: 1 })
    const user = userEvent.setup()
    render(
      <UserPreferenceContext.Provider value={store}>
        <CustomersTable
          columns={CustomerColumns}
          data={[customer]}
          total={1}
          defaultColumns={undefined}
        />
      </UserPreferenceContext.Provider>
    )
    expect(screen.getByTestId("visible").textContent).toContain("email")

    await user.click(screen.getByRole("button", { name: "nascondi email" }))
    // Let the effects of the click run
    await act(() => Promise.resolve())

    expect(screen.getByTestId("visible").textContent).not.toContain("email")
    const saved = cookie("mito-pref-ct")
    expect(saved).toBeDefined()
    expect(JSON.parse(decodeURIComponent(saved!))).toContain("email")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
