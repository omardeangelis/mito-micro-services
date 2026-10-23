import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LogoutFloatingButton } from "../LogoutFloatingButton"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Uscendo, il prossimo operatore dello stesso browser parte dal layout di
// default (AC33)

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }))

describe("LogoutFloatingButton, cookie delle preferenze (AC33)", () => {
  beforeEach(() => {
    document.cookie = "mito-pref-ds=; path=/; max-age=0"
  })

  it("uscendo cancella i cookie delle preferenze e lo store", async () => {
    const store = createUserPreferenceStore({ role: "ADMIN", operatorId: 1 })
    store.getState().setDashboardCollapsed(true)
    store.getState().setContactTableVisibleColumns(["CF"])
    expect(document.cookie).toContain("mito-pref-ds=true")
    render(
      <UserPreferenceContext.Provider value={store}>
        <LogoutFloatingButton />
      </UserPreferenceContext.Provider>
    )

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Esci dal gestionale" }))

    expect(document.cookie).not.toContain("mito-pref-")
    expect(store.getState().preferences).toBeUndefined()
  })
})
