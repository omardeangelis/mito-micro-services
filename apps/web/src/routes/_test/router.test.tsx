import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  createBrowserRouter,
  createMemoryRouter,
  RouterProvider,
} from "react-router"
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest"
import { routes } from "@/router"
import { Layer } from "effect"
import { ada, fakeMe, renderWithApi } from "@/test/api"
import { fakeCustomers } from "@/test/customers"

const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/react", () => ({ captureException }))

const auth = vi.hoisted((): { session: object | null; isPending: boolean } => ({
  session: { user: { name: "Ada" } },
  isPending: false,
}))
vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: () => ({ data: auth.session, isPending: auth.isPending }),
    signOut: vi.fn(),
  },
}))

// The current user of `GET /api/v1/me` (2.2.2)
let backend = fakeMe({})

const open = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  renderWithApi(<RouterProvider router={router} />, {
    handlers: backend.handlers,
    auth: backend.auth,
  })
  return router
}

const heading = () => screen.findByRole("heading", { level: 1 })

afterEach(() => {
  backend = fakeMe({})
  vi.restoreAllMocks()
  auth.session = { user: { name: "Ada" } }
  auth.isPending = false
})

describe("la sessione (F6)", () => {
  it("senza sessione /dashboard e le sue pagine portano al login", async () => {
    auth.session = null
    const router = open("/dashboard/contatti/76006")

    expect(
      await screen.findByRole("button", { name: "Accedi" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/login")
    expect(screen.queryByRole("navigation")).toBeNull()
  })

  it("mentre la sessione si legge non mostra né la pagina né il login", () => {
    auth.isPending = true
    open("/dashboard")

    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryByRole("button", { name: "Accedi" })).toBeNull()
  })

  it("con una sessione /login porta alla dashboard", async () => {
    const router = open("/login")

    expect(await heading()).toHaveTextContent("Home")
    expect(router.state.location.pathname).toBe("/dashboard")
  })
})

describe("le rotte (§5)", () => {
  it("/ porta a /dashboard", async () => {
    const router = open("/")

    expect(await heading()).toHaveTextContent("Home")
    expect(router.state.location.pathname).toBe("/dashboard")
  })

  it.each([
    ["senza nome", { ...ada, name: null }],
    ["senza cognome", { ...ada, surname: "" }],
  ])(
    "/ porta un operatore %s al profilo del primo accesso",
    async (_, operator) => {
      backend = fakeMe({ operator })
      const router = open("/")

      await screen.findAllByRole("tab")
      expect(router.state.location.pathname).toBe("/dashboard/profile")
      expect(router.state.location.search).toBe("?firstTime=true")
    }
  )

  it("/ senza sessione porta al login, senza chiedere l'utente corrente", async () => {
    auth.session = null
    const router = open("/")

    expect(
      await screen.findByRole("button", { name: "Accedi" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/login")
    expect(backend.state.reads).toBe(0)
  })

  it("un link diretto a /dashboard/customers apre la lista dei clienti (3.1)", async () => {
    const customers = fakeCustomers()
    // The history of the browser: the table writes its sort and its page
    // from `window.location`, as in the app
    window.history.replaceState(null, "", "/dashboard/customers")
    const router = createBrowserRouter(routes)
    onTestFinished(() => {
      router.dispose()
      window.history.replaceState(null, "", "/")
    })
    renderWithApi(<RouterProvider router={router} />, {
      handlers: Layer.merge(backend.handlers, customers.handlers),
      auth: backend.auth,
    })

    // The first import of the page and its modules, in a cold test run
    expect(
      await screen.findByText("RSSMRA80A01H501U", {}, { timeout: 5000 })
    ).toBeInTheDocument()
    expect(customers.state.searches).toHaveLength(1)
  })

  it.each([
    ["/dashboard", "Home", "3.5"],
    ["/dashboard/customers/new", "Nuovo customer", "3.1"],
    ["/dashboard/customers/42", "Customer", "3.1"],
    ["/dashboard/customers/42/connect", "Collega il customer", "3.1"],
    ["/dashboard/contatti", "Contatti", "3.2"],
    ["/dashboard/contatti/76006", "Contatto", "3.2"],
    ["/dashboard/pratiche", "Pratiche", "3.3"],
    ["/dashboard/pratiche/7", "Pratica", "3.3"],
    ["/dashboard/import", "Import", "3.6"],
  ])("un link diretto a %s apre la sua pagina", async (path, title, task) => {
    open(path)

    expect(await heading()).toHaveTextContent(title)
    expect(screen.getByText(`Arriva con il task ${task}`)).toBeInTheDocument()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
  })

  it("la pagina riceve l'id della rotta", async () => {
    open("/dashboard/customers/42/connect")

    await heading()
    expect(screen.getByText("id").nextSibling).toHaveTextContent("42")
  })

  it("dal menu si passa da una pagina all'altra", async () => {
    const user = userEvent.setup()
    const router = open("/dashboard")
    await heading()

    await user.click(screen.getByRole("link", { name: "Pratiche" }))

    expect(
      await screen.findByRole("heading", { name: "Pratiche" })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe("/dashboard/pratiche")
  })

  it("un indirizzo che non è una rotta mostra la 404", async () => {
    open("/dashboard/nope/1")

    expect(await heading()).toHaveTextContent("Pagina non trovata")
    expect(
      screen.getByRole("link", { name: "Torna alla dashboard" })
    ).toHaveAttribute("href", "/dashboard")
  })
})

describe("il menu per ruolo (2.2.2)", () => {
  it.each([
    ["ADMIN", true],
    ["OPERATORE", false],
  ] as const)("per un %s il link a Import c'è: %s", async (role, hasImport) => {
    backend = fakeMe({ role })
    open("/dashboard")
    await heading()

    const nav = screen.getByRole("navigation")
    expect(within(nav).queryByRole("link", { name: "Import" }) !== null).toBe(
      hasImport
    )
  })
})

describe("il profilo", () => {
  it("un operatore vede solo il tab Profile, anche con ?tab=admin", async () => {
    open("/dashboard/profile?tab=admin")

    const tabs = await screen.findAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Profile"])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
  })

  it("un admin apre il tab dell'URL, e cambiarlo cambia l'URL", async () => {
    backend = fakeMe({ role: "ADMIN" })
    const user = userEvent.setup()
    const router = open("/dashboard/profile?tab=blacklist")
    await screen.findAllByRole("tab")

    expect(screen.getByRole("tab", { name: "Blacklist" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await user.click(screen.getByRole("tab", { name: "Admin" }))

    expect(router.state.location.search).toBe("?tab=admin")
    expect(
      screen.getByText("Gli operatori arrivano con il task 3.8")
    ).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Profile" }))

    expect(router.state.location.search).toBe("")
  })
})

describe("l'errore dei contatti", () => {
  it("resta nella pagina, con il menu, e va a Sentry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.doMock("@/routes/dashboard/contatti/ContactsPage", () => ({
      Component: () => {
        throw new Error("contacts failed")
      },
    }))

    open("/dashboard/contatti")

    const alert = await screen.findByRole("alert")
    expect(
      within(alert).getByText("Non è stato possibile caricare i contatti")
    ).toBeVisible()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "contacts failed" })
    )
    vi.doUnmock("@/routes/dashboard/contatti/ContactsPage")
  })
})
