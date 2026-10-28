import { cleanup, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { type CustomerFilter } from "@mito/contract/task"
import {
  defaultState,
  seeContactsHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { findTable, renderContacts } from "./page"

// The toggles and the customer filter of the bar, as the tests of
// `ContactFilters.toggles` of the Next.js app, on a backend in memory

/** The list at the address of `state` (or at `path`) */
const renderBar = async (
  state: ContactsListState | string = defaultState,
  customerFilter: CustomerFilter | null = null
) => {
  const backend = fakeContacts({ rows: [] })
  backend.state.page = () => ({
    contacts: [],
    total: 0,
    previous: [],
    customerFilter,
  })
  const view = renderContacts(
    typeof state === "string" ? state : listHref(state),
    backend
  )
  await findTable()
  return view
}

/** The filters bar: the table has a "Priorità" of its own, its order */
const bar = () =>
  within(screen.getByRole("search", { name: "Filtri dei contatti" }))

const customerFilterOf = (
  overrides: Partial<CustomerFilter> = {}
): CustomerFilter => ({
  found: true,
  name: "Mario",
  surname: "Rossi",
  totalContacts: 4,
  ...overrides,
})

const openAdvanced = (user: Awaited<ReturnType<typeof renderBar>>["user"]) =>
  user.click(screen.getByRole("button", { name: /^Filtri Avanzati/ }))

/** Waits for `navigation` to be the last one of the list */
const lastNavigationIs = (navigations: string[], navigation: string) =>
  waitFor(() => expect(navigations.at(-1)).toBe(navigation))

describe("gli interruttori", () => {
  it("sono spenti di default: un link mostra la stessa vista a chiunque (AC16, D8)", async () => {
    const { user } = await renderBar()

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
    const { user, navigations } = await renderBar({ ...defaultState, page: 3 })
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))

    // It shows at once, before the list answers
    expect(
      screen
        .getByRole("switch", { name: "Con alert" })
        .getAttribute("aria-checked")
    ).toBe("true")
    await lastNavigationIs(navigations, "PUSH /dashboard/contatti?alert=1")
    expect(navigations).toHaveLength(1)
  })

  it("attivare 'Solo i miei' aggiunge miei=1 e conserva gli altri filtri", async () => {
    const { user, navigations } = await renderBar({
      ...defaultState,
      states: ["chiamare"],
    })

    await user.click(screen.getByRole("switch", { name: "Solo i miei" }))

    await lastNavigationIs(
      navigations,
      "PUSH /dashboard/contatti?stato=chiamare&miei=1"
    )
  })

  it("spegnere un interruttore acceso toglie il parametro", async () => {
    const { user, navigations } = await renderBar({
      ...defaultState,
      hasAlert: true,
      onlyMe: true,
    })
    await openAdvanced(user)

    await user.click(screen.getByRole("switch", { name: "Con alert" }))

    await lastNavigationIs(navigations, "PUSH /dashboard/contatti?miei=1")
  })

  it("'Contatti chiusi' dice quali sono (AC3)", async () => {
    const { user, navigations } = await renderBar()
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
    await lastNavigationIs(navigations, "PUSH /dashboard/contatti?precedenti=1")
  })
})

describe("la barra come quella di Clienti", () => {
  it("fuori dai Filtri Avanzati ci sono la ricerca, Operatore, Stato, Priorità e 'Solo i miei'", async () => {
    await renderBar()

    expect(bar().getByRole("searchbox", { name: "Cerca cliente" })).toBeTruthy()
    for (const name of ["Operatore", "Stato", "Priorità"]) {
      expect(bar().getByRole("button", { name })).toBeTruthy()
    }
    expect(bar().getByRole("switch", { name: "Solo i miei" })).toBeTruthy()
    expect(bar().getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
    // Everything else is behind the button
    expect(screen.queryByRole("switch", { name: "Con alert" })).toBeNull()
    expect(screen.queryByRole("switch", { name: "Contatti chiusi" })).toBeNull()
    expect(screen.queryByLabelText("Dal")).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Campo data" })).toBeNull()
  })

  it("i Filtri Avanzati contengono il campo data, 'Con alert' e 'Contatti chiusi'", async () => {
    const { user } = await renderBar()

    await openAdvanced(user)

    expect(screen.getByRole("combobox", { name: "Campo data" })).toBeTruthy()
    expect(screen.getByLabelText("Dal")).toBeTruthy()
    expect(screen.getByLabelText("Al")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Con alert" })).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Contatti chiusi" })).toBeTruthy()
  })

  it("il bottone dice quanti filtri avanzati sono attivi", async () => {
    await renderBar({
      ...defaultState,
      hasAlert: true,
      includeInactive: true,
      from: "2026-10-01",
    })

    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 3 attivi" })
    ).toBeTruthy()
  })

  it("con un solo filtro avanzato il bottone dice '1 attivo'; senza, solo il nome", async () => {
    await renderBar({ ...defaultState, hasAlert: true })
    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 1 attivo" })
    ).toBeTruthy()
    cleanup()

    await renderBar()
    expect(screen.getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
  })

  it("il campo data da solo non conta come filtro; un solo estremo sì, una volta", async () => {
    await renderBar({ ...defaultState, dateField: "createdAt" })
    expect(screen.getByRole("button", { name: "Filtri Avanzati" })).toBeTruthy()
    cleanup()

    await renderBar({ ...defaultState, from: "2026-10-01", to: "2026-10-15" })
    expect(
      screen.getByRole("button", { name: "Filtri Avanzati, 1 attivo" })
    ).toBeTruthy()
  })

  it("il menu delle colonne sta nella barra", async () => {
    await renderBar()

    expect(bar().getByRole("button", { name: "Colonne" })).toBeTruthy()
  })
})

describe("il filtro cliente (AC22)", () => {
  it("non compare senza un cliente nell'indirizzo", async () => {
    await renderBar(defaultState, null)

    expect(screen.queryByText(/^Cliente:/)).toBeNull()
  })

  it("mostra il cliente con il nome e si toglie senza toccare gli altri filtri", async () => {
    const { user, navigations } = await renderBar(
      seeContactsHref("c1"),
      customerFilterOf()
    )

    expect(screen.getByText("Cliente: Rossi Mario")).toBeTruthy()
    await user.click(
      screen.getByRole("button", { name: "Rimuovi il filtro cliente" })
    )

    // The previous contacts and the order stay; only the customer goes
    await lastNavigationIs(
      navigations,
      "PUSH /dashboard/contatti?precedenti=1&ordina=creato&verso=desc"
    )
    expect(navigations).toHaveLength(1)
  })

  it("per un cliente che non esiste mostra comunque il filtro, per poterlo togliere", async () => {
    const { user, navigations } = await renderBar(
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

    await lastNavigationIs(navigations, "PUSH /dashboard/contatti")
  })
})
