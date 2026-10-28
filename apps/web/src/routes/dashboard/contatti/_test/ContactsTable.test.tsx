import { act, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@mito/contract/task"
import {
  defaultState,
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { type Role } from "@mito/contract/schemas"
import { contactCustomer, contactRow, fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { currentHref, findTable, renderContacts } from "./page"

// The table of the list on a backend in memory, as the tests of
// `ContactsTable` of the Next.js app: the columns, the previous contacts,
// the way into a contact, the menu of a row, the order and the pages. The
// state cell is the real one: Ada edits the contacts of her customers

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

const contactOf = (overrides: Partial<ContactRow> = {}) =>
  contactRow({ operator: giulia, ...overrides })

const customerOf = contactCustomer

/** The list of `state` showing `contacts`, whatever page it asks for */
const renderTable = async ({
  contacts = [contactOf()],
  previous = [],
  total = contacts.filter(({ isActive }) => isActive).length,
  state = defaultState,
  role,
}: {
  contacts?: ContactRow[]
  previous?: ContactRow[]
  total?: number
  state?: ContactsListState
  role?: Role
} = {}) => {
  const backend = fakeContacts({ rows: contacts, previous })
  backend.state.page = () => ({
    contacts: backend.state.rows,
    previous,
    total,
    customerFilter: null,
  })
  const view = renderContacts(listHref(state), backend, { role })
  await findTable()
  return { ...view, backend }
}

/** The body row of the customer with this "Cognome Nome". */
const rowOf = (customerName: string) =>
  screen.getByRole("link", { name: customerName }).closest("tr")!

afterEach(() => {
  vi.useRealTimers()
})

describe("la tabella dei contatti", () => {
  it("mostra un contatto per riga con le colonne di AC4", async () => {
    await renderTable({
      contacts: [
        contactOf(),
        contactOf({
          id: 102,
          customer: customerOf({ id: "c2", name: "Anna", surname: "Verdi" }),
        }),
      ],
    })

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    for (const name of [
      "Cliente",
      "Telefono",
      "CF",
      "Stato",
      "Priorità",
      "Operatore",
      "Contattato il",
      "Prossimo alert",
      "Creato",
      "Aggiornato",
    ]) {
      expect(headers).toContain(name)
    }
    // The header row and one row per contact
    expect(screen.getAllByRole("row")).toHaveLength(3)

    const row = within(rowOf("Rossi Mario"))
    expect(
      row.getByRole("link", { name: "Rossi Mario" }).getAttribute("href")
    ).toBe("/dashboard/customers/c1")
    expect(row.getByText("333 1234567")).toBeTruthy()
    expect(row.getByText("RSSMRA80A01H501U")).toBeTruthy()
    expect(row.getByText("chiamare")).toBeTruthy()
    expect(row.getByText("Giulia Bianchi")).toBeTruthy()
    expect(row.getByText("3/10/2026")).toBeTruthy()
    expect(row.getByText("1/10/2026")).toBeTruthy()
    expect(row.getByText("2/10/2026")).toBeTruthy()
  })

  it("le righe non hanno transizioni: il colore dell'evidenziazione cambia subito (P17)", async () => {
    await renderTable()

    const row = rowOf("Rossi Mario")
    expect(row.className).toContain("transition-none")
    expect(row.className).not.toContain("transition-colors")
  })

  it("quando la pagina si legge di nuovo le celle non si rimontano: il focus e i menu aperti restano dove sono", async () => {
    // After a save the page is read again: a new page with the same
    // contacts. A cell that remounts takes the focus of its control with it
    const { backend, queryClient } = await renderTable()
    const link = screen.getByRole("link", { name: "Rossi Mario" })
    const status = screen.getByRole("button", { name: /cambia stato/ })
    const actions = screen.getByRole("button", {
      name: "Azioni per Rossi Mario",
    })

    await act(() => queryClient.invalidateQueries())
    await waitFor(() => expect(backend.state.queries).toHaveLength(2))

    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBe(link)
    expect(screen.getByRole("button", { name: /cambia stato/ })).toBe(status)
    expect(screen.getByRole("button", { name: "Azioni per Rossi Mario" })).toBe(
      actions
    )
  })

  it("il nome del cliente non è in nessun attributo: il Replay di Sentry maschera il testo, non gli attributi (M9)", async () => {
    await renderTable({
      contacts: [
        contactOf({
          customer: customerOf({ name: "Michele", surname: "Loddo" }),
        }),
      ],
    })

    const leaked = [...document.body.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes]
        .filter((attribute) => /loddo|michele/i.test(attribute.value))
        .map((attribute) => `${element.tagName} ${attribute.name}`)
    )
    expect(leaked).toEqual([])
    // The name is still what a screen reader hears for the menu of the row
    expect(
      screen.getByRole("button", { name: "Azioni per Loddo Michele" })
    ).toBeTruthy()
  })

  it("mostra la partita IVA nella colonna CF quando manca il codice fiscale", async () => {
    await renderTable({
      contacts: [
        contactOf({
          customer: customerOf({ fiscalCode: null, vatCode: "01234567890" }),
        }),
      ],
    })

    expect(within(rowOf("Rossi Mario")).getByText("01234567890")).toBeTruthy()
  })

  it("dice 'Non assegnato' quando il contatto non ha un operatore", async () => {
    await renderTable({ contacts: [contactOf({ operator: null })] })

    expect(within(rowOf("Rossi Mario")).getByText("Non assegnato")).toBeTruthy()
  })

  it("mostra il badge blacklist accanto al cliente solo se lo stato non è neutro (D7)", async () => {
    const named = (
      id: number,
      surname: string,
      blackListStatus: ContactRow["customer"]["blackListStatus"]
    ) =>
      contactOf({
        id,
        customer: customerOf({
          id: `c${id}`,
          name: "Test",
          surname,
          blackListStatus,
        }),
      })
    await renderTable({
      contacts: [
        named(1, "Nera", "blacklisted"),
        named(2, "Gialla", "review"),
        named(3, "Bianca", "whitelisted"),
      ],
    })

    expect(
      within(rowOf("Nera Test")).getByRole("img", { name: /blacklist/i })
    ).toBeTruthy()
    expect(
      within(rowOf("Gialla Test")).getByRole("img", { name: /blacklist/i })
    ).toBeTruthy()
    expect(
      within(rowOf("Bianca Test")).queryByRole("img", { name: /blacklist/i })
    ).toBeNull()
  })

  it("mostra la priorità a fasce, anche per un contatto senza priorità (AC12)", async () => {
    const named = (id: number, surname: string, priority: number | null) =>
      contactOf({
        id,
        priority,
        customer: customerOf({ id: `c${id}`, name: "Test", surname }),
      })
    await renderTable({
      contacts: [named(1, "Nulla", null), named(2, "Urgente", 150)],
    })

    // A NULL priority is the lowest band, like the filter reads it
    expect(rowOf("Nulla Test").querySelector("svg.lucide-arrow-down")).not.toBe(
      null
    )
    expect(rowOf("Urgente Test").querySelector("svg.lucide-arrow-up")).not.toBe(
      null
    )
  })

  describe("Prossimo alert", () => {
    const alertOf = (deadline: string, message: string | null = null) => ({
      id: 1,
      deadline: new Date(deadline),
      message,
    })
    const named = (id: number, surname: string, alert: ContactRow["alert"]) =>
      contactOf({
        id,
        alert,
        customer: customerOf({ id: `c${id}`, name: "Test", surname }),
      })

    it("evidenzia con icona e testo la scadenza di oggi e quella passata, secondo l'ora italiana (AC7)", async () => {
      // The list is read at 12:00 of 15/10/2026 in Rome
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-10-15T10:00:00Z"))
      await renderTable({
        contacts: [
          // 14/10 00:00 Rome, 15/10 00:00 Rome, 16/10 00:00 Rome
          named(1, "Ieri", alertOf("2026-10-13T22:00:00Z")),
          named(2, "Oggi", alertOf("2026-10-14T22:00:00Z")),
          named(3, "Domani", alertOf("2026-10-15T22:00:00Z")),
        ],
      })

      const overdue = within(rowOf("Ieri Test")).getByText("Scaduto")
      expect(overdue.parentElement?.querySelector("svg")).not.toBe(null)
      const today = within(rowOf("Oggi Test")).getByText("Oggi")
      expect(today.parentElement?.querySelector("svg")).not.toBe(null)

      const tomorrow = within(rowOf("Domani Test"))
      expect(tomorrow.queryByText("Oggi")).toBeNull()
      expect(tomorrow.queryByText("Scaduto")).toBeNull()
      // The deadline is shown all the same
      // 22:00Z of the 15th is already the 16th in Italy, in any zone
      expect(tomorrow.getByText("16/10/2026")).toBeTruthy()
    })

    it("mostra il messaggio al passaggio del mouse (AC6)", async () => {
      await renderTable({
        contacts: [
          named(
            1,
            "Richiamo",
            alertOf("2099-10-15T22:00:00Z", "Richiamare dopo le 15")
          ),
        ],
      })

      expect(
        within(rowOf("Richiamo Test")).getByTitle("Richiamare dopo le 15")
      ).toBeTruthy()
    })

    it("lascia vuota la cella senza un alert aperto (AC6)", async () => {
      await renderTable({ contacts: [named(1, "Libero", null)] })

      const row = within(rowOf("Libero Test"))
      expect(row.queryByText("Oggi")).toBeNull()
      expect(row.queryByText("Scaduto")).toBeNull()
    })
  })

  it("marca come 'Concluso' i contatti non più attivi (AC3)", async () => {
    await renderTable({
      contacts: [
        contactOf({
          id: 1,
          isActive: false,
          customer: customerOf({ id: "c1", name: "Test", surname: "Vecchio" }),
        }),
        contactOf({
          id: 2,
          customer: customerOf({ id: "c2", name: "Test", surname: "Attuale" }),
        }),
      ],
      total: 2,
    })

    expect(within(rowOf("Vecchio Test")).getByText("Concluso")).toBeTruthy()
    expect(within(rowOf("Attuale Test")).queryByText("Concluso")).toBeNull()
  })

  describe("i contatti precedenti come sotto-righe (AC3)", () => {
    const active = contactOf({
      id: 10,
      customer: customerOf({ id: "c1", name: "Mario", surname: "Rossi" }),
    })
    const previous = [
      contactOf({
        id: 8,
        isActive: false,
        state: "erogata",
        createdAt: new Date("2026-09-20T08:00:00Z"),
        customer: customerOf({ id: "c1", name: "Mario", surname: "Rossi" }),
      }),
      contactOf({
        id: 7,
        isActive: false,
        state: "non interessato",
        createdAt: new Date("2026-09-10T08:00:00Z"),
        customer: customerOf({ id: "c1", name: "Mario", surname: "Rossi" }),
      }),
    ]
    const other = contactOf({
      id: 20,
      customer: customerOf({ id: "c2", name: "Anna", surname: "Bianchi" }),
    })

    const rowIds = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.getAttribute("data-contact-id"))

    it("stanno sotto il contatto attivo del loro cliente, prima del cliente dopo", async () => {
      await renderTable({ contacts: [active, other], previous })

      expect(rowIds()).toEqual(["10", "8", "7", "20"])
    })

    it("si riconoscono dall'essere sotto: niente scritta 'Concluso', una riga rientrata", async () => {
      await renderTable({ contacts: [active], previous })

      expect(screen.queryByText("Concluso")).toBeNull()
      const rows = screen.getAllByRole("row").slice(1)
      expect(rows.map((row) => row.hasAttribute("data-previous"))).toEqual([
        false,
        true,
        true,
      ])
      expect(within(rows[1]!).getByText("erogata")).toBeTruthy()
      expect(within(rows[2]!).getByText("non interessato")).toBeTruthy()
    })

    it("il cliente è un link solo sulla riga attiva; la sotto-riga lo nomina per chi usa un lettore di schermo", async () => {
      await renderTable({ contacts: [active], previous })

      expect(screen.getAllByRole("link", { name: "Rossi Mario" })).toHaveLength(
        1
      )
      const nested = screen.getAllByRole("row")[2]!
      expect(nested.textContent).toContain("Contatto concluso: Rossi Mario")
      // The menu of the row is still named by the customer
      expect(
        within(nested).getByRole("button", {
          name: "Azioni per Contatto concluso: Rossi Mario",
        })
      ).toBeTruthy()
    })

    it("un clic sulla sotto-riga apre quel contatto, in sola lettura", async () => {
      const { user } = await renderTable({ contacts: [active], previous })

      await user.click(screen.getAllByRole("row")[2]!)

      expect(await screen.findByText("dettaglio")).toBeTruthy()
      expect(currentHref()).toBe(detailHref(8, defaultState))
    })

    it("il totale e le righe vere restano quelle dei contatti attivi", async () => {
      await renderTable({ contacts: [active, other], previous })

      expect(screen.getByText(/1 - 2 di 2/)).toBeTruthy()
    })

    it("un contatto precedente senza un contatto attivo del cliente è una riga come le altre, con 'Concluso'", async () => {
      await renderTable({
        contacts: [
          contactOf({
            id: 1,
            isActive: false,
            customer: customerOf({ id: "c9", name: "Test", surname: "Solo" }),
          }),
        ],
        total: 1,
      })

      expect(within(rowOf("Solo Test")).getByText("Concluso")).toBeTruthy()
      expect(screen.getAllByRole("row")[1]!.hasAttribute("data-previous")).toBe(
        false
      )
    })
  })

  describe("apertura del dettaglio", () => {
    const state: ContactsListState = {
      ...defaultState,
      states: ["chiamare"],
      page: 2,
    }

    it("il clic sulla riga apre il dettaglio e porta con sé la vista della lista (AC24, AC25)", async () => {
      const { user, navigations } = await renderTable({ state, total: 40 })

      await user.click(within(rowOf("Rossi Mario")).getByText("333 1234567"))

      expect(await screen.findByText("dettaglio")).toBeTruthy()
      expect(navigations).toEqual([`PUSH ${detailHref(101, state)}`])
    })

    it("il link al cliente apre la scheda e non il dettaglio", async () => {
      const { user, navigations } = await renderTable({ state, total: 40 })

      await user.click(screen.getByRole("link", { name: "Rossi Mario" }))

      expect(await screen.findByText("altra pagina")).toBeTruthy()
      expect(navigations).toEqual(["PUSH /dashboard/customers/c1"])
    })
  })

  describe("menu azioni (AC8)", () => {
    const openMenu = async (
      user: Awaited<ReturnType<typeof renderTable>>["user"],
      customerName = "Rossi Mario"
    ) => {
      await user.click(
        within(rowOf(customerName)).getByRole("button", {
          name: `Azioni per ${customerName}`,
        })
      )
      return screen.getByRole("menu")
    }

    it("offre 'Apri contatto', 'Apri cliente' e 'Copia telefono', in quest'ordine, senza aprire la riga", async () => {
      const state: ContactsListState = { ...defaultState, hasAlert: true }
      const { user, navigations } = await renderTable({ state })

      const menu = await openMenu(user)

      const items = within(menu).getAllByRole("menuitem")
      expect(items.map((item) => item.textContent)).toEqual([
        "Apri contatto",
        "Apri cliente",
        "Copia telefono",
      ])
      expect(items[0]!.getAttribute("href")).toBe(detailHref(101, state))
      expect(items[1]!.getAttribute("href")).toBe("/dashboard/customers/c1")
      // Opening the menu is not opening the contact
      expect(navigations).toEqual([])
    })

    it("'Copia telefono' copia il numero negli appunti e non apre la riga", async () => {
      const { user, navigations } = await renderTable()
      const writeText = vi.spyOn(navigator.clipboard, "writeText")
      const menu = await openMenu(user)

      await user.click(
        within(menu).getByRole("menuitem", { name: "Copia telefono" })
      )

      expect(writeText).toHaveBeenCalledWith("333 1234567")
      expect(navigations).toEqual([])
    })

    it("non offre 'Copia telefono' se il cliente non ha un telefono", async () => {
      const { user } = await renderTable({
        contacts: [contactOf({ customer: customerOf({ phoneNumber: null }) })],
      })

      const menu = await openMenu(user)

      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent)
      ).toEqual(["Apri contatto", "Apri cliente"])
    })

    it("si apre da tastiera e 'Apri contatto' apre il dettaglio una volta sola", async () => {
      const { user, navigations } = await renderTable()
      within(rowOf("Rossi Mario"))
        .getByRole("button", { name: "Azioni per Rossi Mario" })
        .focus()

      await user.keyboard("{Enter}")
      const menu = screen.getByRole("menu")
      expect(
        within(menu).getAllByRole("menuitem")[0]!.getAttribute("href")
      ).toBe(detailHref(101, defaultState))
      await user.keyboard("{Enter}")

      // The anchor does the navigation; the row must not add its own
      expect(await screen.findByText("dettaglio")).toBeTruthy()
      expect(navigations).toEqual([`PUSH ${detailHref(101, defaultState)}`])
    })
  })

  describe("ordinamento (AC13, AC17)", () => {
    const columnheader = (name: string) =>
      screen.getByRole("columnheader", { name })

    it("segna la colonna ordinata con aria-sort", async () => {
      await renderTable()

      expect(columnheader("Priorità").getAttribute("aria-sort")).toBe(
        "descending"
      )
      expect(columnheader("Creato").getAttribute("aria-sort")).not.toBe(
        "descending"
      )
    })

    it("ordina per un'altra colonna in senso decrescente e torna a pagina 1", async () => {
      const { user, navigations } = await renderTable({
        state: { ...defaultState, page: 3 },
        total: 100,
      })

      await user.click(
        within(columnheader("Creato")).getByRole("button", { name: "Creato" })
      )

      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?ordina=creato&verso=desc",
      ])
    })

    it("ordina per Cliente in senso crescente alla prima scelta", async () => {
      const { user, navigations } = await renderTable()

      await user.click(
        within(columnheader("Cliente")).getByRole("button", { name: "Cliente" })
      )

      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?ordina=cliente&verso=asc",
      ])
    })

    it("sulla colonna già ordinata inverte il senso", async () => {
      const { user, navigations } = await renderTable()

      await user.click(
        within(columnheader("Priorità")).getByRole("button", {
          name: "Priorità",
        })
      )

      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?ordina=priorita&verso=asc",
      ])
    })

    it("conserva i filtri e non ordina per le colonne che il server non ordina", async () => {
      const { user, navigations } = await renderTable({
        state: { ...defaultState, states: ["chiamare"], hasAlert: true },
      })

      expect(within(columnheader("Telefono")).queryByRole("button")).toBeNull()
      expect(within(columnheader("Stato")).queryByRole("button")).toBeNull()

      await user.click(
        within(columnheader("Aggiornato")).getByRole("button", {
          name: "Aggiornato",
        })
      )
      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?stato=chiamare&alert=1&ordina=aggiornato&verso=desc",
      ])
    })

    it("l'indirizzo nuovo chiede al backend l'ordine scelto", async () => {
      const { user, backend } = await renderTable()

      await user.click(
        within(columnheader("Creato")).getByRole("button", { name: "Creato" })
      )

      await waitFor(() =>
        expect(backend.state.queries.at(-1)).toMatchObject({
          orderBy: "createdAt",
          sortedBy: "desc",
          page: 1,
        })
      )
      await waitFor(() =>
        expect(columnheader("Creato").getAttribute("aria-sort")).toBe(
          "descending"
        )
      )
    })
  })

  describe("paginazione (AC14, AC17)", () => {
    const page2: ContactsListState = {
      ...defaultState,
      states: ["chiamare"],
      page: 2,
    }

    it("mostra l'intervallo e il totale", async () => {
      await renderTable({ state: page2, total: 95 })

      expect(screen.getByText("21 - 40 di 95")).toBeTruthy()
    })

    it("collega le pagine vicine con gli stessi filtri", async () => {
      await renderTable({ state: page2, total: 95 })

      expect(
        screen
          .getByRole("link", { name: "Pagina successiva" })
          .getAttribute("href")
      ).toBe("/dashboard/contatti?stato=chiamare&pagina=3")
      expect(
        screen
          .getByRole("link", { name: "Pagina precedente" })
          .getAttribute("href")
      ).toBe("/dashboard/contatti?stato=chiamare")
    })

    it("non offre la pagina prima della prima né dopo l'ultima", async () => {
      const { unmount } = await renderTable({ total: 95 })
      expect(
        screen.queryByRole("link", { name: "Pagina precedente" })
      ).toBeNull()
      expect(
        screen.getByRole("link", { name: "Pagina successiva" })
      ).toBeTruthy()
      unmount()

      await renderTable({ state: { ...defaultState, page: 5 }, total: 95 })
      expect(
        screen.getByRole("link", { name: "Pagina precedente" })
      ).toBeTruthy()
      expect(
        screen.queryByRole("link", { name: "Pagina successiva" })
      ).toBeNull()
    })

    it("naviga con un solo push al clic su una pagina", async () => {
      const { user, navigations } = await renderTable({
        state: page2,
        total: 95,
      })

      await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?stato=chiamare&pagina=3",
      ])
    })

    it("cambia il numero di righe e torna a pagina 1", async () => {
      const { user, navigations } = await renderTable({
        state: page2,
        total: 95,
      })

      await user.click(
        screen.getByRole("combobox", { name: "Righe per pagina" })
      )
      await user.click(screen.getByRole("option", { name: "50" }))

      expect(navigations).toEqual([
        "PUSH /dashboard/contatti?stato=chiamare&per_pagina=50",
      ])
    })
  })
})
