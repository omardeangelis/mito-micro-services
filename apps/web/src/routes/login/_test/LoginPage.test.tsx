import { render, screen } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Component as LoginPage } from "@/routes/login/LoginPage"

const auth = vi.hoisted((): { session: object | null } => ({ session: null }))
vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: () => ({ data: auth.session, isPending: false }),
    signIn: { social: vi.fn(), magicLink: vi.fn() },
  },
}))
const env = vi.hoisted((): { VITE_AUTH_TEST_LOGIN?: "true" | "false" } => ({}))
vi.mock("@/env", () => ({ env }))

const open = (path: string) => {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/dashboard", element: <h1>Dashboard</h1> },
    ],
    { initialEntries: [path] }
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  auth.session = null
  env.VITE_AUTH_TEST_LOGIN = undefined
})

describe("pagina di login", () => {
  it("con ?error=1 mostra Accesso non riuscito (AC13)", () => {
    open("/login?error=1")

    expect(screen.getByRole("alert")).toHaveTextContent("Accesso non riuscito")
  })

  it("senza errore non mostra avvisi, solo Accedi con Microsoft", () => {
    open("/login")

    expect(screen.queryByRole("alert")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Accedi con Microsoft" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Entra come admin" })
    ).toBeNull()
  })

  it("senza VITE_AUTH_TEST_LOGIN non c'è il campo email (OQ6)", () => {
    open("/login")

    expect(screen.queryByLabelText("Email")).toBeNull()
  })

  it("con VITE_AUTH_TEST_LOGIN=true c'è il campo email del login di prova", () => {
    env.VITE_AUTH_TEST_LOGIN = "true"
    open("/login")

    expect(screen.getByLabelText("Email")).toBeInTheDocument()
  })

  it("con il login di prova, in vite dev, offre l'accesso rapido", () => {
    env.VITE_AUTH_TEST_LOGIN = "true"
    open("/login")

    // vitest runs with import.meta.env.DEV, as `vite dev`
    expect(
      screen.getByRole("button", { name: "Entra come admin" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Entra come operatore" })
    ).toBeInTheDocument()
  })

  it("con una sessione manda alla dashboard", async () => {
    auth.session = { user: { name: "Ada" } }
    const router = open("/login")

    expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard")
    expect(router.state.location.pathname).toBe("/dashboard")
  })
})
