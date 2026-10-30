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
    $fetch: vi.fn(async () => ({ data: { ok: true }, error: null })),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("LoginForm", () => {
  it("Accedi con Microsoft avvia il login con Microsoft (AC23)", async () => {
    render(<LoginForm testLogin={false} />)

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Accedi con Microsoft" }))

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

  it("senza devLogin non ci sono i bottoni dell'accesso rapido", () => {
    render(<LoginForm testLogin />)

    expect(
      screen.queryByRole("button", { name: "Entra come admin" })
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Entra come operatore" })
    ).toBeNull()
  })

  it("l'accesso rapido entra come admin o come operatore e va alla dashboard", async () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    const user = userEvent.setup()
    render(<LoginForm testLogin devLogin />)

    await user.click(screen.getByRole("button", { name: "Entra come admin" }))
    await user.click(
      screen.getByRole("button", { name: "Entra come operatore" })
    )

    expect(authClient.$fetch).toHaveBeenNthCalledWith(
      1,
      "/sign-in/dev-account",
      { method: "POST", body: { account: "admin" } }
    )
    expect(authClient.$fetch).toHaveBeenNthCalledWith(
      2,
      "/sign-in/dev-account",
      { method: "POST", body: { account: "operator" } }
    )
    expect(assign).toHaveBeenCalledWith("/dashboard")
    vi.unstubAllGlobals()
  })

  it("se l'accesso rapido non riesce mostra Accesso non riuscito", async () => {
    vi.mocked(authClient.$fetch).mockResolvedValueOnce({
      data: null,
      error: { status: 404, statusText: "Not Found" },
    })
    render(<LoginForm testLogin devLogin />)

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Entra come admin" }))

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Accesso non riuscito"
    )
  })
})
