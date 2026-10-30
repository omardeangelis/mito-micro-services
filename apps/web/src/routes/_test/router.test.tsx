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
import { contactDetail, fakeContacts } from "@/test/contacts"
import { fakeCustomers } from "@/test/customers"
import { fakeHome } from "@/test/home"
import { fakeImport } from "@/test/import"
import { fakePratiche } from "@/test/pratiche"
import { fakeProfile } from "@/test/profile"

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

// The current user, the home of the dashboard (3.5) where most routes land,
// and the latest import the shell asks an admin for (3.6); the groups of the
// page in `page`, under the current user of `backend`
const open = (
  path: string,
  page?: ReturnType<typeof fakeProfile>["handlers"]
) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const handlers = Layer.mergeAll(
    backend.handlers,
    fakeHome().handlers,
    fakeImport().handlers
  )
  renderWithApi(<RouterProvider router={router} />, {
    handlers: page ? Layer.merge(page, handlers) : handlers,
    auth: backend.auth,
  })
  return router
}

const heading = () => screen.findByRole("heading", { level: 1 })

/**
 * The home of the dashboard, once it is on screen: after the first import of
 * the page and its charts, in a cold test run
 */
const home = () =>
  screen.findByRole("heading", { name: "Analisi Andamento" }, { timeout: 5000 })

afterEach(() => {
  backend = fakeMe({})
  vi.restoreAllMocks()
  auth.session = { user: { name: "Ada" } }
  auth.isPending = false
})

describe("la sessione (F6)", () => {
  it(
    "senza sessione /dashboard e le sue pagine portano al login",
    { timeout: 15000 },
    async () => {
      auth.session = null
      const router = open("/dashboard/contatti/76006")

      // After the first import of the page of the address, in a cold test run
      expect(
        await screen.findByRole(
          "button",
          { name: "Accedi con Microsoft" },
          { timeout: 10000 }
        )
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe("/login")
      expect(screen.queryByRole("navigation")).toBeNull()
    }
  )

  it("mentre la sessione si legge non mostra né la pagina né il login", () => {
    auth.isPending = true
    open("/dashboard")

    expect(screen.queryByRole("navigation")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Accedi con Microsoft" })
    ).toBeNull()
  })

  it("con una sessione /login porta alla dashboard", async () => {
    const router = open("/login")

    expect(await home()).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard")
  })
})

describe("le rotte (§5)", () => {
  it("/ porta a /dashboard", async () => {
    const router = open("/")

    expect(await home()).toBeInTheDocument()
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

      await screen.findByRole("heading", { name: "Profilo" })
      expect(router.state.location.pathname).toBe("/dashboard/settings/profile")
      expect(router.state.location.search).toBe("?firstTime=true")
    }
  )

  it("/ senza sessione porta al login, senza chiedere l'utente corrente", async () => {
    auth.session = null
    const router = open("/")

    expect(
      await screen.findByRole("button", { name: "Accedi con Microsoft" })
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

  it("un link diretto a /dashboard/contatti apre la lista dei contatti (3.2)", async () => {
    const contacts = fakeContacts()
    window.history.replaceState(null, "", "/dashboard/contatti?stato=chiamare")
    const router = createBrowserRouter(routes)
    onTestFinished(() => {
      router.dispose()
      window.history.replaceState(null, "", "/")
    })
    renderWithApi(<RouterProvider router={router} />, {
      handlers: Layer.merge(backend.handlers, contacts.handlers),
      auth: backend.auth,
    })

    // The first import of the page and its modules, in a cold test run
    expect(
      await screen.findByRole("table", { name: "Contatti" }, { timeout: 10000 })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBeVisible()
    expect(contacts.state.queries).toEqual([
      expect.objectContaining({ states: ["chiamare"] }),
    ])
  }, 15000)

  it("un link diretto al dettaglio di un contatto lo apre nella sua finestra (3.2)", async () => {
    const contacts = fakeContacts({ details: { 101: contactDetail() } })
    window.history.replaceState(null, "", "/dashboard/contatti/101")
    const router = createBrowserRouter(routes)
    onTestFinished(() => {
      router.dispose()
      window.history.replaceState(null, "", "/")
    })
    renderWithApi(<RouterProvider router={router} />, {
      handlers: Layer.merge(backend.handlers, contacts.handlers),
      auth: backend.auth,
    })

    // The first import of the page and its modules, in a cold test run
    const sheet = await screen.findByRole(
      "dialog",
      { name: "Dettaglio contatto" },
      { timeout: 10000 }
    )
    expect(
      await within(sheet).findByRole("heading", { name: "Rossi Mario" })
    ).toBeInTheDocument()
    expect(contacts.state.detailReads).toEqual(["101"])
  }, 15000)

  it.each([
    ["/dashboard/pratiche", "PR-2026-1"],
    ["/dashboard/pratiche/PR-2026-1", "Dettaglio Pratica"],
  ])(
    "un link diretto a %s apre la sua pagina (3.3)",
    async (path, text) => {
      const pratiche = fakePratiche()
      window.history.replaceState(null, "", path)
      const router = createBrowserRouter(routes)
      onTestFinished(() => {
        router.dispose()
        window.history.replaceState(null, "", "/")
      })
      renderWithApi(<RouterProvider router={router} />, {
        handlers: Layer.merge(backend.handlers, pratiche.handlers),
        auth: backend.auth,
      })

      // The first import of the page and its modules, in a cold and busy
      // test run
      expect(
        await screen.findByText(text, {}, { timeout: 10000 })
      ).toBeInTheDocument()
    },
    15000
  )

  it.each([
    ["/dashboard/customers/new", "Nuovo cliente"],
    ["/dashboard/customers/customer-1", "Scheda Cliente"],
    ["/dashboard/customers/customer-1/connect", "Dettaglio Pratica"],
  ])(
    "un link diretto a %s apre la sua pagina (3.1)",
    async (path, title) => {
      const customers = fakeCustomers()
      window.history.replaceState(null, "", path)
      const router = createBrowserRouter(routes)
      onTestFinished(() => {
        router.dispose()
        window.history.replaceState(null, "", "/")
      })
      renderWithApi(<RouterProvider router={router} />, {
        handlers: Layer.merge(backend.handlers, customers.handlers),
        auth: backend.auth,
      })

      // The first import of the page and its modules, in a cold and busy
      // test run
      expect(
        await screen.findByText(title, {}, { timeout: 10000 })
      ).toBeInTheDocument()
    },
    15000
  )

  it("un link diretto a /dashboard apre la home (3.5)", async () => {
    open("/dashboard")

    expect(await home()).toBeInTheDocument()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
  })

  it("un link diretto a /dashboard/import apre l'import a un admin (3.6)", async () => {
    backend = fakeMe({ role: "ADMIN" })
    open("/dashboard/import")

    expect(await heading()).toHaveTextContent("Import")
    expect(
      await screen.findByRole("button", { name: "Scegli il file" })
    ).toBeInTheDocument()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
  })

  it("/dashboard/import non esiste per un operatore (AC1)", async () => {
    open("/dashboard/import")

    expect(await heading()).toHaveTextContent("Pagina non trovata")
  })

  it("dal menu si passa da una pagina all'altra", async () => {
    backend = fakeMe({ role: "ADMIN" })
    const user = userEvent.setup()
    const router = open("/dashboard")
    await home()

    await user.click(screen.getByRole("link", { name: "Import" }))

    expect(await screen.findByRole("heading", { name: "Import" })).toBeVisible()
    expect(router.state.location.pathname).toBe("/dashboard/import")
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
    await home()

    const nav = screen.getByRole("navigation")
    expect(within(nav).queryByRole("link", { name: "Import" }) !== null).toBe(
      hasImport
    )
  })
})

describe("le impostazioni", () => {
  it.each([
    [
      "/dashboard/profile?firstTime=true",
      "/dashboard/settings/profile",
      "?firstTime=true",
    ],
    ["/dashboard/profile", "/dashboard/settings/profile", ""],
    ["/dashboard/settings", "/dashboard/settings/profile", ""],
  ])("%s porta a %s%s", async (from, pathname, search) => {
    const router = open(from)

    await screen.findByRole("heading", { name: "Profilo" })
    expect(router.state.location.pathname).toBe(pathname)
    expect(router.state.location.search).toBe(search)
  })

  it.each([
    ["/dashboard/profile?tab=admin", "/dashboard/settings/team", "Team"],
    [
      "/dashboard/profile?tab=blacklist",
      "/dashboard/settings/blacklist",
      "Blacklist",
    ],
  ])("per un admin %s porta a %s", async (from, pathname, heading) => {
    backend = fakeMe({ role: "ADMIN" })
    const router = open(from, fakeProfile().handlers)

    expect(
      await screen.findByRole("heading", { level: 1, name: heading })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe(pathname)
  })

  it("un operatore che apre Team va al suo profilo", async () => {
    const router = open("/dashboard/profile?tab=admin")

    await screen.findByRole("heading", { name: "Profilo" })
    expect(router.state.location.pathname).toBe("/dashboard/settings/profile")
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
