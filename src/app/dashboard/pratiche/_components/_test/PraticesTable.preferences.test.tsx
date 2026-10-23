import React from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type Column } from "@tanstack/react-table"
import { PracticesTable } from "../PraticesTable"
import { PraticheTableColumns } from "../TableColumn"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Le colonne nascoste di Pratiche restano nel browser, in un cookie, e la
// lista nello store vince sulla prop del server (AC31, AC32)

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// The menu of the columns, reduced to what the test needs: the visible
// columns and a way to hide one
vi.mock("../TableFilterSection", () => ({
  TableFilterSection: ({
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
            .find((column) => column.id === "Prodotto")!
            .toggleVisibility(false)
        }
      >
        nascondi prodotto
      </button>
    </div>
  ),
}))
vi.mock("@/components/custom/table/TablePagination", () => ({
  TablePagination: () => null,
}))

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

const mount = (
  preferences: Parameters<typeof createUserPreferenceStore>[0]["preferences"],
  dafaultColumns: Record<string, boolean> | undefined
) => {
  const store = createUserPreferenceStore({
    role: "ADMIN",
    operatorId: 1,
    preferences,
  })
  render(
    <UserPreferenceContext.Provider value={store}>
      <PracticesTable
        columns={PraticheTableColumns}
        data={[]}
        total={0}
        dafaultColumns={dafaultColumns}
      />
    </UserPreferenceContext.Provider>
  )
  return store
}

beforeEach(() => {
  clearCookies()
  fetchSpy.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PracticesTable, colonne nascoste nel cookie (AC31)", () => {
  it("nascondere una colonna la toglie dalla tabella e scrive il cookie senza nessuna fetch", async () => {
    const user = userEvent.setup()
    mount(undefined, undefined)
    expect(screen.getByTestId("visible").textContent).toContain("Prodotto")

    await user.click(screen.getByRole("button", { name: "nascondi prodotto" }))
    // Let the effects of the click run
    await act(() => Promise.resolve())

    expect(screen.getByTestId("visible").textContent).not.toContain("Prodotto")
    const saved = cookie("mito-pref-pt")
    expect(saved).toBeDefined()
    expect(JSON.parse(decodeURIComponent(saved!))).toContain("Prodotto")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("non scrive nessun cookie solo per essere stata mostrata", async () => {
    mount({ practicesTableVisibleColumns: ["Prodotto"] }, undefined)
    await act(() => Promise.resolve())

    expect(document.cookie).toBe("")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("PracticesTable, da dove prende le colonne (AC32)", () => {
  it("lo store vince sulla prop del server, che è quella del render in cache", () => {
    mount({ practicesTableVisibleColumns: ["Prodotto"] }, {})

    expect(screen.getByTestId("visible").textContent).not.toContain("Prodotto")
  })

  it("senza niente nello store parte dalla prop del server", () => {
    mount(undefined, { Prodotto: false })

    expect(screen.getByTestId("visible").textContent).not.toContain("Prodotto")
  })
})
