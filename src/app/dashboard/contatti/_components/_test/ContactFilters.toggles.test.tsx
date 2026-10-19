import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type CustomerFilter } from "@/server/services/contact/getContacts"
import {
  defaultState,
  seeContactsHref,
  parse,
  type ContactsListState,
} from "../../_lib/searchParams"
import { ContactFilters } from "../ContactFilters"
import { ContactsListShell } from "../ContactsListShell"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

// The tests look at the address; the options of the navigation are the
// business of ContactsListShell.test.tsx
const router = {
  push: (href: string) => {
    mocks.push(href)
  },
  replace: (href: string) => {
    mocks.replace(href)
  },
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({ useRouter: () => router }))

// The columns menu has its own tests; here it only has to be in the bar
vi.mock("../ContactColumnsMenu", () => ({
  ContactColumnsMenu: () => <div data-testid="columns-menu" />,
}))

const renderBar = (
  state: ContactsListState = defaultState,
  customerFilter: CustomerFilter | null = null
) => {
  const user = userEvent.setup()
  render(
    <ContactsListShell>
      <ContactFilters
        state={state}
        operators={[]}
        customerFilter={customerFilter}
      />
    </ContactsListShell>
  )
  return user
}

const customerFilterOf = (
  overrides: Partial<CustomerFilter> = {}
): CustomerFilter => ({
  found: true,
  name: "Mario",
  surname: "Rossi",
  totalContacts: 4,
  ...overrides,
})

const openAdvanced = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Filtri Avanzati/ }))

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
})

describe("gli interruttori", () => {
  it("sono spenti di default: un link mostra la stessa vista a chiunque (AC16, D8)", async () => {
    const user = renderBar()

    expect(
      screen
        .getByRole("switch", { name: "Solo i miei" })
        .getAttribute("aria-checked")
    ).toBe("false")
    await openAdvanced(user)
    for (const name of ["Con alert", "Contatti chiusi"]) {
      expect(
        screen.getByRole("switch", { name }).getAttribute("aria-checked")
      ).toBe("false")
    }
  })

  it("attivare 'Con alert' aggiunge alert=1 e torna a pagina 1 (AC10, AC17)", async () => {
    const user = renderBar({ ...defaultState, page: 3 })
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti?alert=1")
    // It shows at once, before the list answers
    expect(
      screen
        .getByRole("switch", { name: "Con alert" })
        .getAttribute("aria-checked")
    ).toBe("true")
  })

  it("attivare 'Solo i miei' aggiunge miei=1 e conserva gli altri filtri", async () => {
    const user = renderBar({ ...defaultState, states: ["chiamare"] })

    await user.click(screen.getByRole("switch", { name: "Solo i miei" }))

    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=chiamare&miei=1"
    )
  })

  it("spegnere un interruttore acceso toglie il parametro", async () => {
    const user = renderBar({ ...defaultState, hasAlert: true, onlyMe: true })
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti?miei=1")
  })

  it("'Contatti chiusi' dice quali sono (AC3)", async () => {
    const user = renderBar()
    await openAdvanced(user)
    const toggle = screen.getByRole("switch", { name: "Contatti chiusi" })

    expect(toggle.getAttribute("aria-describedby")).toBeTruthy()
    expect(
      document.getElementById(toggle.getAttribute("aria-describedby")!)
        ?.textContent
    ).toContain(
      "sostituiti da una riapertura, un followup o un'assegnazione massiva"
    )

    await user.click(toggle)
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti?precedenti=1")
  })
})

describe("la barra come quella di Clienti", () => {
  it("fuori dai Filtri Avanzati ci sono la ricerca, Operatore, Stato, Priorità e 'Solo i miei'", () => {
    renderBar()

    expect(
      screen.getByRole("searchbox", { name: "Cerca cliente" })
    ).toBeTruthy()
    for (const name of ["Operatore", "Stato", "Priorità"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy()
    }
    expect(screen.getByRole("switch", { name: "Solo i miei" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
    // Everything else is behind the button
    expect(screen.queryByRole("switch", { name: "Con alert" })).toBeNull()
    expect(screen.queryByRole("switch", { name: "Contatti chiusi" })).toBeNull()
    expect(screen.queryByLabelText("Dal")).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Campo data" })).toBeNull()
  })

  it("i Filtri Avanzati contengono il campo data, 'Con alert' e 'Contatti chiusi'", async () => {
    const user = renderBar()

    await openAdvanced(user)

    expect(screen.getByRole("combobox", { name: "Campo data" })).toBeTruthy()
    expect(screen.getByLabelText("Dal")).toBeTruthy()
    expect(screen.getByLabelText("Al")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Con alert" })).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Contatti chiusi" })).toBeTruthy()
  })

  it("il bottone dice quanti filtri avanzati sono attivi", () => {
    renderBar({
      ...defaultState,
      hasAlert: true,
      includeInactive: true,
      from: "2026-10-01",
    })

    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 3 attivi" })
    ).toBeTruthy()
  })

  it("con un solo filtro avanzato il bottone dice '1 attivo'; senza, solo il nome", () => {
    renderBar({ ...defaultState, hasAlert: true })
    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 1 attivo" })
    ).toBeTruthy()
    cleanup()

    renderBar()
    expect(screen.getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
  })

  it("il campo data da solo non conta come filtro; un solo estremo sì, una volta", () => {
    renderBar({ ...defaultState, dateField: "createdAt" })
    expect(screen.getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
    cleanup()

    renderBar({ ...defaultState, from: "2026-10-01", to: "2026-10-15" })
    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 1 attivo" })
    ).toBeTruthy()
  })

  it("il menu delle colonne sta nella barra", () => {
    renderBar()

    expect(screen.getByTestId("columns-menu")).toBeTruthy()
  })
})

describe("il filtro cliente (AC22)", () => {
  it("non compare senza un cliente nell'indirizzo", () => {
    renderBar(defaultState, null)

    expect(screen.queryByText(/^Cliente:/)).toBeNull()
  })

  it("mostra il cliente con il nome e si toglie senza toccare gli altri filtri", async () => {
    const href = seeContactsHref("c1")
    const state = parse(
      Object.fromEntries(new URL(href, "http://x").searchParams)
    )
    const user = renderBar(state, customerFilterOf())

    expect(screen.getByText("Cliente: Rossi Mario")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Rimuovi il filtro cliente" })
    )

    // The previous contacts and the order stay; only the customer goes
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?precedenti=1&ordina=creato&verso=desc"
    )
  })

  it("per un cliente che non esiste mostra comunque il filtro, per poterlo togliere", async () => {
    const user = renderBar(
      { ...defaultState, customerId: "inesistente" },
      customerFilterOf({
        found: false,
        name: null,
        surname: null,
        totalContacts: 0,
      })
    )

    expect(screen.getByText("Cliente: non trovato")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Rimuovi il filtro cliente" })
    )

    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti")
  })
})
