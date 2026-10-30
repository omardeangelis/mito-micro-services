import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { meKeys } from "@/api/me"
import { LogoutButton } from "@/routes/dashboard/settings/_components/LogoutButton"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Uscendo, il prossimo operatore dello stesso browser parte dal layout di
// default (AC33)

vi.mock("@/lib/authClient", () => ({
  authClient: { signOut: vi.fn(async () => undefined) },
}))

describe("LogoutButton, cookie delle preferenze (AC33)", () => {
  beforeEach(() => {
    document.cookie = "mito-pref-ds=; path=/; max-age=0"
  })

  it("uscendo cancella i cookie delle preferenze e lo store", async () => {
    const store = createUserPreferenceStore({ role: "ADMIN", operatorId: 1 })
    store.getState().setDashboardCollapsed(true)
    store.getState().setContactTableVisibleColumns(["CF"])
    expect(document.cookie).toContain("mito-pref-ds=true")
    const queryClient = new QueryClient()
    queryClient.setQueryData(meKeys.current(), { role: "ADMIN" })
    render(
      <QueryClientProvider client={queryClient}>
        <UserPreferenceContext.Provider value={store}>
          <LogoutButton />
        </UserPreferenceContext.Provider>
      </QueryClientProvider>
    )

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Esci dal gestionale" }))

    expect(document.cookie).not.toContain("mito-pref-")
    expect(store.getState().preferences).toBeUndefined()
    // Nor what the backend answered for this operator (H12)
    expect(queryClient.getQueryData(meKeys.current())).toBeUndefined()
  })
})
