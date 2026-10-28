import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LogoutFloatingButton } from "@/routes/dashboard/profile/LogoutFloatingButton"
import {
  startDeleting,
  takeDeleted,
} from "@/components/custom/notes/deletingNotes"

const draftKey = "mito:nota-non-inviata:c-42"
const draftAtSignOut: Array<string | null> = []

vi.mock("@/lib/authClient", () => ({
  authClient: {
    signOut: vi.fn(async () => {
      draftAtSignOut.push(window.sessionStorage.getItem(draftKey))
    }),
  },
}))
vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: () => () => undefined,
}))

describe("LogoutFloatingButton", () => {
  it("uscendo cancella le bozze delle note prima di chiudere la sessione", async () => {
    window.sessionStorage.setItem(
      draftKey,
      JSON.stringify({ operatorId: 11, text: "Nota di un cliente" })
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LogoutFloatingButton />
      </QueryClientProvider>
    )

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Esci dal gestionale" }))

    expect(draftAtSignOut).toEqual([null])
  })

  it("uscendo dimentica le note in eliminazione: il prossimo operatore non vede attese", async () => {
    startDeleting("c-42", 905, [])
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LogoutFloatingButton />
      </QueryClientProvider>
    )

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Esci dal gestionale" }))

    // Nothing left to wait for, or to announce
    expect(takeDeleted("c-42", [])).toEqual([])
  })
})
