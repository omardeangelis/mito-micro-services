import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LogoutFloatingButton } from "../LogoutFloatingButton"

const draftKey = "mito:nota-non-inviata:c-42"
const draftAtSignOut: Array<string | null> = []

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(async () => {
    draftAtSignOut.push(window.sessionStorage.getItem(draftKey))
  }),
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
    render(<LogoutFloatingButton />)

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Esci dal gestionale" }))

    expect(draftAtSignOut).toEqual([null])
  })
})
