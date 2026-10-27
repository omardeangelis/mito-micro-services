import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { authClient } from "@/lib/authClient"
import { LoginForm } from "@/routes/login/LoginForm"

vi.mock("@/lib/authClient", () => ({
  authClient: {
    signIn: {
      social: vi.fn(async () => ({ data: {}, error: null })),
      magicLink: vi.fn(async () => ({ data: { status: true }, error: null })),
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("LoginForm", () => {
  it("Accedi avvia il login con Microsoft (AC23)", async () => {
    render(<LoginForm testLogin={false} />)

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Accedi" }))

    expect(authClient.signIn.social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "microsoft" })
    )
  })

  it("il login di prova manda il link all'email scritta (AC24)", async () => {
    const user = userEvent.setup()
    render(<LoginForm testLogin />)

    await user.type(screen.getByLabelText("Email"), "ada@test.local")
    await user.click(screen.getByRole("button", { name: "Invia il link" }))

    expect(authClient.signIn.magicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@test.local" })
    )
    expect((await screen.findByRole("status")).textContent).toContain(
      "Se l'indirizzo può accedere, riceverà il link"
    )
  })

  it("se il server rifiuta la richiesta del link mostra Accesso non riuscito", async () => {
    vi.mocked(authClient.signIn.magicLink).mockResolvedValueOnce({
      data: null,
      error: { status: 500, statusText: "Internal Server Error" },
    })
    const user = userEvent.setup()
    render(<LoginForm testLogin />)

    await user.type(screen.getByLabelText("Email"), "ada@test.local")
    await user.click(screen.getByRole("button", { name: "Invia il link" }))

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Accesso non riuscito"
    )
  })
})
