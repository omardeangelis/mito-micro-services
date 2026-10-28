import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@mito/server/services/contact/getContacts"
import {
  defaultState,
  detailHref,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { ContactsListShell } from "../ContactsListShell"
import { ContactsTable } from "../ContactsTable"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
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

// A plain anchor that never navigates: what the app does on a click is the
// handlers' job, and `router.push` is what the tests look at
vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    // Like the real `Link`, it hands its `ref` to the anchor: Radix needs it
    // when a menu item is a link (`asChild`)
    default: forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a"> & { prefetch?: boolean }
    >(function LinkMock(
      { href, children, onClick, prefetch: _prefetch, ...rest },
      ref
    ) {
      return (
        <a
          ref={ref}
          href={href}
          onClick={(event) => {
            onClick?.(event)
            event.preventDefault()
          }}
          {...rest}
        >
          {children}
        </a>
      )
    }),
  }
})

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

// The menu of the hidden columns has its own tests (it needs the preference store)
vi.mock("../ContactColumnsMenu", () => ({ ContactColumnsMenu: () => null }))

// The cell of the state has its own tests (it calls the server): here it is the
// saved value, and "Concluso" for a contact that is no longer the active one
vi.mock("../ContactRowState", () => ({
  ContactRowState: ({
    contact,
    nested,
  }: {
    contact: { state: string | null; isActive: boolean }
    nested?: boolean
  }) => (
    <div className="w-40">
      <span>{contact.state ?? "nessuno"}</span>
      {contact.isActive || nested ? null : <span>Concluso</span>}
    </div>
  ),
}))

// 12:00 of 15/10/2026 in Rome
const now = new Date("2026-10-15T10:00:00Z")

const customerOf = (
  overrides: Partial<ContactRow["customer"]> = {}
): ContactRow["customer"] => ({
  id: "c1",
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "333 1234567",
  fiscalCode: "RSSMRA80A01H501U",
  vatCode: null,
  blackListStatus: "whitelisted",
  operatorId: 7,
  ...overrides,
})

const contactOf = (overrides: Partial<ContactRow> = {}): ContactRow => ({
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: new Date("2026-10-03T08:00:00Z"),
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: 9, name: "Giulia", surname: "Bianchi" },
  customer: customerOf(),
  alert: null,
  ...overrides,
})

type Props = React.ComponentProps<typeof ContactsTable>

const renderTable = (props: Partial<Props> = {}) => {
  const user = userEvent.setup()
  render(
    <ContactsListShell>
      <ContactsTable
        contacts={[contactOf()]}
        total={1}
        state={defaultState}
        hiddenColumns={[]}
        now={now}
        {...props}
      />
    </ContactsListShell>
  )
  return user
}

/** The body row of the customer with this "Cognome Nome". */
const rowOf = (customerName: string) =>
  screen.getByRole("link", { name: customerName }).closest("tr")!

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
  mocks.refresh.mockClear()
  mocks.toast.mockClear()
})

describe("la tabella dei contatti", () => {
  it("mostra un contatto per riga con le colonne di AC4", () => {
    renderTable({
      contacts: [
        contactOf(),
        contactOf({
          id: 102,
          customer: customerOf({ id: "c2", name: "Anna", surname: "Verdi" }),
        }),
      ],
      total: 2,
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

  it("le righe non hanno transizioni: il colore dell'evidenziazione cambia subito (P17)", () => {
    renderTable()

    const row = rowOf("Rossi Mario")
    expect(row.className).toContain("transition-none")
    expect(row.className).not.toContain("transition-colors")
  })

  it("quando la pagina si aggiorna le celle non si rimontano: il focus e i menu aperti restano dove sono", () => {
    // After a save the server renders the page again: a new `now` and a new
    // state object, with the same contacts. A cell that remounts takes the
    // focus of its control with it.
    const view = render(
      <ContactsListShell>
        <ContactsTable
          contacts={[contactOf()]}
          total={1}
          state={defaultState}
          hiddenColumns={[]}
          now={now}
        />
      </ContactsListShell>
    )
    const link = screen.getByRole("link", { name: "Rossi Mario" })
    const status = screen.getByText("chiamare")
    const actions = screen.getByRole("button", {
      name: "Azioni per Rossi Mario",
    })

    view.rerender(
      <ContactsListShell>
        <ContactsTable
          contacts={[contactOf()]}
          total={1}
          state={{ ...defaultState }}
          hiddenColumns={[]}
          now={new Date(now.getTime() + 1_000)}
        />
      </ContactsListShell>
    )

    expect(screen.getByRole("link", { name: "Rossi Mario" })).toBe(link)
    expect(screen.getByText("chiamare")).toBe(status)
    expect(screen.getByRole("button", { name: "Azioni per Rossi Mario" })).toBe(
      actions
    )
  })

  it("il nome del cliente non è in nessun attributo: il Replay di Sentry maschera il testo, non gli attributi (M9)", () => {
    renderTable({
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

  it("mostra la partita IVA nella colonna CF quando manca il codice fiscale", () => {
    renderTable({
      contacts: [
        contactOf({
          customer: customerOf({ fiscalCode: null, vatCode: "01234567890" }),
        }),
      ],
    })

    expect(within(rowOf("Rossi Mario")).getByText("01234567890")).toBeTruthy()
  })

  it("dice 'Non assegnato' quando il contatto non ha un operatore", () => {
    renderTable({ contacts: [contactOf({ operator: null })] })

    expect(within(rowOf("Rossi Mario")).getByText("Non assegnato")).toBeTruthy()
  })

  it("mostra il badge blacklist accanto al cliente solo se lo stato non è neutro (D7)", () => {
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
    renderTable({
      contacts: [
        named(1, "Nera", "blacklisted"),
        named(2, "Gialla", "review"),
        named(3, "Bianca", "whitelisted"),
      ],
      total: 3,
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

  it("mostra la priorità a fasce, anche per un contatto senza priorità (AC12)", () => {
    const named = (id: number, surname: string, priority: number | null) =>
      contactOf({
        id,
        priority,
        customer: customerOf({ id: `c${id}`, name: "Test", surname }),
      })
    renderTable({
      contacts: [named(1, "Nulla", null), named(2, "Urgente", 150)],
      total: 2,
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

    it("evidenzia con icona e testo la scadenza di oggi e quella passata, secondo l'ora italiana (AC7)", () => {
      renderTable({
        contacts: [
          // 14/10 00:00 Rome, 15/10 00:00 Rome, 16/10 00:00 Rome
          named(1, "Ieri", alertOf("2026-10-13T22:00:00Z")),
          named(2, "Oggi", alertOf("2026-10-14T22:00:00Z")),
          named(3, "Domani", alertOf("2026-10-15T22:00:00Z")),
        ],
        total: 3,
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

    it("mostra il messaggio al passaggio del mouse (AC6)", () => {
      renderTable({
        contacts: [
          named(
            1,
            "Richiamo",
            alertOf("2026-10-15T22:00:00Z", "Richiamare dopo le 15")
          ),
        ],
      })

      expect(
        within(rowOf("Richiamo Test")).getByTitle("Richiamare dopo le 15")
      ).toBeTruthy()
    })

    it("lascia vuota la cella senza un alert aperto (AC6)", () => {
      renderTable({ contacts: [named(1, "Libero", null)] })

      const row = within(rowOf("Libero Test"))
      expect(row.queryByText("Oggi")).toBeNull()
      expect(row.queryByText("Scaduto")).toBeNull()
    })
  })

  it("marca come 'Concluso' i contatti non più attivi (AC3)", () => {
    renderTable({
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

    it("stanno sotto il contatto attivo del loro cliente, prima del cliente dopo", () => {
      renderTable({
        contacts: [active, other],
        previous,
        total: 2,
      })

      expect(rowIds()).toEqual(["10", "8", "7", "20"])
    })

    it("si riconoscono dall'essere sotto: niente scritta 'Concluso', una riga rientrata", () => {
      renderTable({ contacts: [active], previous, total: 1 })

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

    it("il cliente è un link solo sulla riga attiva; la sotto-riga lo nomina per chi usa un lettore di schermo", () => {
      renderTable({ contacts: [active], previous, total: 1 })

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
      const user = renderTable({ contacts: [active], previous, total: 1 })

      await user.click(screen.getAllByRole("row")[2]!)

      expect(mocks.push).toHaveBeenCalledWith(detailHref(8, defaultState))
    })

    it("il totale e le righe vere restano quelle dei contatti attivi", () => {
      renderTable({ contacts: [active, other], previous, total: 2 })

      expect(screen.getByText(/1 - 2 di 2/)).toBeTruthy()
    })

    it("un contatto precedente senza un contatto attivo del cliente è una riga come le altre, con 'Concluso'", () => {
      renderTable({
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

  it("nasconde le colonne scelte dall'operatore e ignora i nomi che non conosce (AC5)", () => {
    renderTable({ hiddenColumns: ["Telefono", "CF", "colonna-inventata"] })

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim())
    expect(headers).not.toContain("Telefono")
    expect(headers).not.toContain("CF")
    expect(headers).toContain("Stato")
    expect(screen.queryByText("333 1234567")).toBeNull()
    expect(screen.queryByText("RSSMRA80A01H501U")).toBeNull()
  })

  describe("apertura del dettaglio", () => {
    const state: ContactsListState = {
      ...defaultState,
      states: ["chiamare"],
      page: 2,
    }

    it("il clic sulla riga apre il dettaglio e porta con sé la vista della lista (AC24, AC25)", async () => {
      const user = renderTable({ state, total: 40 })

      await user.click(within(rowOf("Rossi Mario")).getByText("chiamare"))

      expect(mocks.push).toHaveBeenCalledTimes(1)
      expect(mocks.push).toHaveBeenCalledWith(detailHref(101, state))
    })

    it("il link al cliente apre la scheda e non il dettaglio", async () => {
      const user = renderTable({ state, total: 40 })

      await user.click(screen.getByRole("link", { name: "Rossi Mario" }))

      expect(mocks.push).not.toHaveBeenCalled()
    })
  })

  describe("menu azioni (AC8)", () => {
    const openMenu = async (
      user: ReturnType<typeof userEvent.setup>,
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
      const user = renderTable({ state })

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
      expect(mocks.push).not.toHaveBeenCalled()
    })

    it("'Copia telefono' copia il numero negli appunti e non apre la riga", async () => {
      const user = renderTable()
      const writeText = vi.spyOn(navigator.clipboard, "writeText")
      const menu = await openMenu(user)

      await user.click(
        within(menu).getByRole("menuitem", { name: "Copia telefono" })
      )

      expect(writeText).toHaveBeenCalledWith("333 1234567")
      expect(mocks.push).not.toHaveBeenCalled()
    })

    it("non offre 'Copia telefono' se il cliente non ha un telefono", async () => {
      const user = renderTable({
        contacts: [contactOf({ customer: customerOf({ phoneNumber: null }) })],
      })

      const menu = await openMenu(user)

      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent)
      ).toEqual(["Apri contatto", "Apri cliente"])
    })

    it("si apre da tastiera e 'Apri contatto' non apre il dettaglio una seconda volta", async () => {
      const user = renderTable()
      within(rowOf("Rossi Mario"))
        .getByRole("button", { name: "Azioni per Rossi Mario" })
        .focus()

      await user.keyboard("{Enter}")
      const menu = screen.getByRole("menu")
      expect(
        within(menu).getAllByRole("menuitem")[0]!.getAttribute("href")
      ).toBe(detailHref(101, defaultState))
      await user.keyboard("{Enter}")

      // The anchor does the navigation (Link); the row must not add its own
      expect(mocks.push).not.toHaveBeenCalled()
    })
  })

  describe("ordinamento (AC13, AC17)", () => {
    const columnheader = (name: string) =>
      screen.getByRole("columnheader", { name })

    it("segna la colonna ordinata con aria-sort", () => {
      renderTable()

      expect(columnheader("Priorità").getAttribute("aria-sort")).toBe(
        "descending"
      )
      expect(columnheader("Creato").getAttribute("aria-sort")).not.toBe(
        "descending"
      )
    })

    it("ordina per un'altra colonna in senso decrescente e torna a pagina 1", async () => {
      const user = renderTable({
        state: { ...defaultState, page: 3 },
        total: 100,
      })

      await user.click(
        within(columnheader("Creato")).getByRole("button", { name: "Creato" })
      )

      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?ordina=creato&verso=desc"
      )
    })

    it("ordina per Cliente in senso crescente alla prima scelta", async () => {
      const user = renderTable()

      await user.click(
        within(columnheader("Cliente")).getByRole("button", { name: "Cliente" })
      )

      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?ordina=cliente&verso=asc"
      )
    })

    it("sulla colonna già ordinata inverte il senso", async () => {
      const user = renderTable()

      await user.click(
        within(columnheader("Priorità")).getByRole("button", {
          name: "Priorità",
        })
      )

      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?ordina=priorita&verso=asc"
      )
    })

    it("conserva i filtri e non ordina per le colonne che il server non ordina", async () => {
      const user = renderTable({
        state: { ...defaultState, states: ["chiamare"], hasAlert: true },
      })

      expect(within(columnheader("Telefono")).queryByRole("button")).toBeNull()
      expect(within(columnheader("Stato")).queryByRole("button")).toBeNull()

      await user.click(
        within(columnheader("Aggiornato")).getByRole("button", {
          name: "Aggiornato",
        })
      )
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?stato=chiamare&alert=1&ordina=aggiornato&verso=desc"
      )
    })
  })

  describe("paginazione (AC14, AC17)", () => {
    const page2: ContactsListState = {
      ...defaultState,
      states: ["chiamare"],
      page: 2,
    }

    it("mostra l'intervallo e il totale", () => {
      renderTable({ state: page2, total: 95 })

      expect(screen.getByText("21 - 40 di 95")).toBeTruthy()
    })

    it("collega le pagine vicine con gli stessi filtri", () => {
      renderTable({ state: page2, total: 95 })

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

    it("non offre la pagina prima della prima né dopo l'ultima", () => {
      const { unmount } = render(
        <ContactsListShell>
          <ContactsTable
            contacts={[contactOf()]}
            total={95}
            state={defaultState}
            hiddenColumns={[]}
            now={now}
          />
        </ContactsListShell>
      )
      expect(
        screen.queryByRole("link", { name: "Pagina precedente" })
      ).toBeNull()
      expect(
        screen.getByRole("link", { name: "Pagina successiva" })
      ).toBeTruthy()
      unmount()

      renderTable({ state: { ...defaultState, page: 5 }, total: 95 })
      expect(
        screen.getByRole("link", { name: "Pagina precedente" })
      ).toBeTruthy()
      expect(
        screen.queryByRole("link", { name: "Pagina successiva" })
      ).toBeNull()
    })

    it("naviga con un solo push al clic su una pagina", async () => {
      const user = renderTable({ state: page2, total: 95 })

      await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

      expect(mocks.push).toHaveBeenCalledTimes(1)
      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?stato=chiamare&pagina=3"
      )
    })

    it("cambia il numero di righe e torna a pagina 1", async () => {
      const user = renderTable({ state: page2, total: 95 })

      await user.click(
        screen.getByRole("combobox", { name: "Righe per pagina" })
      )
      await user.click(screen.getByRole("option", { name: "50" }))

      expect(mocks.push).toHaveBeenCalledWith(
        "/dashboard/contatti?stato=chiamare&per_pagina=50"
      )
    })
  })
})
