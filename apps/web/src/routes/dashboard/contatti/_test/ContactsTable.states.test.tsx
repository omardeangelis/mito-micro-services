import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { type ContactRow, type CustomerFilter } from "@mito/contract/task"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { contactCustomer, contactRow, fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { saveReturnFocus } from "../_lib/returnFocus"
import { currentHref, findTable, renderContacts } from "./page"

// The empty states of the list and the return from a detail, as the tests of
// `ContactsTable.states` of the Next.js app, on a backend in memory

const contact = contactRow({
  operator: { id: 9, name: "Giulia", surname: "Bianchi" },
})

/** The list of `state` showing `contacts`, out of `total` */
const renderTable = async ({
  contacts = [],
  total = contacts.length,
  state = defaultState,
  customerFilter = null,
}: {
  contacts?: ContactRow[]
  total?: number
  state?: ContactsListState
  customerFilter?: CustomerFilter | null
} = {}) => {
  const backend = fakeContacts({ rows: contacts })
  backend.state.page = () => ({
    contacts,
    previous: [],
    total,
    customerFilter,
  })
  const view = renderContacts(listHref(state), backend)
  await findTable()
  return view
}

const customerFilterOf = (
  overrides: Partial<CustomerFilter> = {}
): CustomerFilter => ({
  found: true,
  name: "Mario",
  surname: "Rossi",
  totalContacts: 0,
  ...overrides,
})

beforeEach(() => {
  sessionStorage.clear()
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe("la tabella dei contatti: stati vuoti", () => {
  it("con una pagina oltre l'ultima offre il link alla prima, con gli stessi filtri (AC19)", async () => {
    const { user, navigations } = await renderTable({
      state: { ...defaultState, states: ["chiamare"], page: 99 },
      total: 95,
    })

    const link = screen.getByRole("link", { name: "Vai alla prima pagina" })
    expect(link.getAttribute("href")).toBe("/dashboard/contatti?stato=chiamare")
    await user.click(link)
    await waitFor(() =>
      expect(currentHref()).toBe("/dashboard/contatti?stato=chiamare")
    )
    expect(navigations).toEqual(["PUSH /dashboard/contatti?stato=chiamare"])
  })

  it("oltre l'ultima pagina il contatore non finge un intervallo e 'Precedente' porta all'ultima (AC19)", async () => {
    await renderTable({
      state: { ...defaultState, states: ["chiamare"], page: 99 },
      total: 95,
    })

    expect(screen.getByText("0 - 0 di 95")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Pagina precedente" })
        .getAttribute("href")
    ).toBe("/dashboard/contatti?stato=chiamare&pagina=5")
    expect(screen.queryByRole("link", { name: "Pagina successiva" })).toBeNull()
  })

  it("con una lista vuota elenca i filtri attivi e offre 'Azzera filtri' (AC20)", async () => {
    const { user } = await renderTable({
      state: { ...defaultState, states: ["chiamare"], hasAlert: true },
    })

    // One element introduces the list with "Filtri attivi", then names each
    const filters = screen.getByText(/Filtri attivi/)
    expect(filters.textContent).toMatch(/Stato/)
    expect(filters.textContent).toMatch(/Con alert/)
    expect(filters.textContent).not.toMatch(/Operatore/)
    expect(
      screen.queryByRole("link", { name: "Vai alla prima pagina" })
    ).toBeNull()
    const reset = screen.getByRole("link", { name: "Azzera filtri" })
    expect(reset.getAttribute("href")).toBe("/dashboard/contatti")
    await user.click(reset)
    await waitFor(() => expect(currentHref()).toBe("/dashboard/contatti"))
  })

  it("col solo 'Solo i miei' dice 'Non hai contatti assegnati' (A13)", async () => {
    await renderTable({ state: { ...defaultState, onlyMe: true } })

    expect(screen.getByText("Non hai contatti assegnati")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("con altri filtri oltre a 'Solo i miei' non dice 'Non hai contatti assegnati'", async () => {
    await renderTable({
      state: { ...defaultState, onlyMe: true, hasAlert: true },
    })

    expect(screen.queryByText("Non hai contatti assegnati")).toBeNull()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("per un cliente senza contatti lo dice e rimanda alla scheda cliente (AC23)", async () => {
    await renderTable({
      state: { ...defaultState, customerId: "c1" },
      customerFilter: customerFilterOf({ totalContacts: 0 }),
    })

    expect(screen.getByText("Questo cliente non ha contatti")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Apri scheda cliente" })
        .getAttribute("href")
    ).toBe("/dashboard/customers/c1")
  })

  it("lo dice anche con altri filtri attivi: conta il totale del cliente, non la lista vuota", async () => {
    await renderTable({
      state: { ...defaultState, customerId: "c1", states: ["chiamare"] },
      customerFilter: customerFilterOf({ totalContacts: 0 }),
    })

    expect(screen.getByText("Questo cliente non ha contatti")).toBeTruthy()
  })

  it("per un cliente con soli contatti precedenti, esclusi, non dice che non ha contatti", async () => {
    await renderTable({
      state: { ...defaultState, customerId: "c1" },
      customerFilter: customerFilterOf({ totalContacts: 3 }),
    })

    expect(screen.queryByText("Questo cliente non ha contatti")).toBeNull()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("per un cliente che non esiste dice 'Cliente non trovato' (AC23)", async () => {
    await renderTable({
      state: { ...defaultState, customerId: "inesistente" },
      customerFilter: customerFilterOf({
        found: false,
        name: null,
        surname: null,
      }),
    })

    expect(screen.getByText("Cliente non trovato")).toBeTruthy()
    expect(screen.queryByText("Questo cliente non ha contatti")).toBeNull()
  })

  it("non mostra nessun messaggio quando ci sono contatti", async () => {
    await renderTable({
      contacts: [contact],
      state: { ...defaultState, onlyMe: true },
    })

    expect(screen.queryByText("Non hai contatti assegnati")).toBeNull()
    expect(screen.queryByRole("link", { name: "Azzera filtri" })).toBeNull()
    expect(
      screen.queryByRole("link", { name: "Vai alla prima pagina" })
    ).toBeNull()
  })
})

describe("la tabella dei contatti: ritorno dal dettaglio", () => {
  const state: ContactsListState = { ...defaultState, hasAlert: true }

  it("porta il focus sul menu azioni della riga da cui si era partiti", async () => {
    saveReturnFocus(101)

    await renderTable({ contacts: [contact], state })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Azioni per Rossi Mario" })
      )
    )
  })

  it("se la riga non c'è più, porta il focus sulla tabella, mai su body", async () => {
    saveReturnFocus(555)

    await renderTable({ contacts: [contact], state })

    const table = screen.getByRole("table")
    await waitFor(() => expect(document.activeElement).toBe(table))
    expect(table.getAttribute("tabindex")).toBe("-1")
  })

  it("non sposta il focus se non si arriva da un dettaglio", async () => {
    await renderTable({ contacts: [contact], state })

    expect(document.activeElement).toBe(document.body)
  })

  it("trova la riga anche con i menu delle altre righe presenti", async () => {
    saveReturnFocus(102)
    const second = contactRow({
      ...contact,
      id: 102,
      customer: contactCustomer({ id: "c2", surname: "Verdi", name: "Anna" }),
    })

    await renderTable({ contacts: [contact, second], state })

    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(screen.getByRole("table")).getByRole("button", {
          name: "Azioni per Verdi Anna",
        })
      )
    )
  })
})
