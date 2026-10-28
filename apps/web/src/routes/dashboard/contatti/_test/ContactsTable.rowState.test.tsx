import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { type ContactRow, type ContactsPage } from "@mito/contract/task"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { contactCustomer, contactRow, fakeContacts } from "@/test/contacts"
import { listHref } from "../_lib/listHref"
import { findTable, renderContacts } from "./page"

// A row that leaves the list after its state changed, as the tests of
// `ContactsTable.rowState` of the Next.js app: the backend in memory answers
// the reading after the save with `afterRefresh`

const rowOf = (id: number, surname: string): ContactRow =>
  contactRow({
    id,
    customer: contactCustomer({
      id: `c${id}`,
      name: "Test",
      surname,
      phoneNumber: null,
      fiscalCode: null,
    }),
  })

/** A concluded contact: no state selector, only the badge. */
const concluded = (id: number, surname: string): ContactRow => ({
  ...rowOf(id, surname),
  isActive: false,
  closedAt: new Date("2026-10-03T09:00:00Z"),
})

const filtered: ContactsListState = { ...defaultState, states: ["chiamare"] }

/** The list of Alfa, Beta and Gamma; after a save, `afterRefresh` */
const setup = async (
  afterRefresh: ContactRow[],
  afterTotal: number,
  {
    previous = [],
    afterPrevious = [],
  }: { previous?: ContactRow[]; afterPrevious?: ContactRow[] } = {}
) => {
  const backend = fakeContacts()
  let page: ContactsPage = {
    contacts: [rowOf(1, "Alfa"), rowOf(2, "Beta"), rowOf(3, "Gamma")],
    total: 3,
    previous,
    customerFilter: null,
  }
  backend.state.page = () => page
  backend.state.changeAnswer = () => {
    page = {
      contacts: afterRefresh,
      total: afterTotal,
      previous: afterPrevious,
      customerFilter: null,
    }
    return { saved: true }
  }
  const view = renderContacts(listHref(filtered), backend)
  await findTable()
  return view.user
}

const triggers = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-contact-state-trigger]")
  )

/** The status node that is read aloud: the one that is not the empty state. */
const announcement = () =>
  document.querySelector<HTMLElement>('[role="status"].sr-only')!

const changeRow = async (
  user: Awaited<ReturnType<typeof setup>>,
  index: number
) => {
  await user.click(triggers()[index]!)
  await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
}

beforeEach(() => {
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe("una riga che esce dai filtri dopo il cambio di stato (A9, P17)", () => {
  it("sparisce, e lo dice a chi usa un lettore di schermo con il nome del cliente e il totale", async () => {
    const user = await setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(announcement().textContent).toBe(
      "Il contatto di Beta Test non è più nell'elenco. 2 contatti."
    )
  })

  it("con un solo contatto rimasto dice '1 contatto'", async () => {
    const user = await setup([rowOf(1, "Alfa")], 1)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(announcement().textContent).toBe(
      "Il contatto di Beta Test non è più nell'elenco. 1 contatto."
    )
  })

  it("il focus passa al selettore della riga che prende il suo posto, non resta su body", async () => {
    const user = await setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    const [first, second] = triggers()
    expect(first).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(second))
    expect(within(second!.closest("tr")!).getByText("Gamma Test")).toBeTruthy()
  })

  it("se la riga era l'ultima, il focus va al selettore di quella prima", async () => {
    const user = await setup([rowOf(1, "Alfa"), rowOf(2, "Beta")], 2)

    await changeRow(user, 2)

    await waitFor(() => expect(screen.queryByText("Gamma Test")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(triggers()[1]))
  })
})

describe("il focus quando le righe vicine non hanno il selettore (P17)", () => {
  it("la riga che prende il posto è di un contatto concluso, senza selettore: il focus salta alla prossima che ce l'ha", async () => {
    const user = await setup(
      [rowOf(1, "Alfa"), concluded(9, "Zeta"), rowOf(3, "Gamma")],
      2
    )

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(triggers()[1]))
    expect(
      within(document.activeElement!.closest("tr")!).getByText("Gamma Test")
    ).toBeTruthy()
  })

  it("se dopo non c'è nessun selettore, il focus va a quello di prima", async () => {
    const user = await setup([rowOf(1, "Alfa"), concluded(9, "Zeta")], 1)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(triggers()[0]))
  })

  it("la riga che esce aveva sotto i contatti precedenti: sono righe senza selettore e il focus va alla riga attiva dopo", async () => {
    const user = await setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2, {
      // Of the customer of the second row: it hangs under it
      previous: [
        { ...concluded(20, "Beta"), customer: rowOf(2, "Beta").customer },
      ],
      afterPrevious: [],
    })
    // Alfa, Beta, the previous contact of Beta (nested), Gamma
    expect(document.querySelectorAll("tbody > tr")).toHaveLength(4)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(triggers()[1]))
    expect(
      within(document.activeElement!.closest("tr")!).getByText("Gamma Test")
    ).toBeTruthy()
  })

  it("quando non resta nessun selettore, il focus va alla tabella e non a body", async () => {
    const user = await setup([concluded(9, "Zeta")], 0)

    await changeRow(user, 1)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    await waitFor(() => expect(document.activeElement?.tagName).toBe("TABLE"))
  })
})

describe("una riga che resta nell'elenco", () => {
  it("non annuncia niente e tiene il focus sul suo selettore", async () => {
    const user = await setup(
      [rowOf(1, "Alfa"), rowOf(2, "Beta"), rowOf(3, "Gamma")],
      3
    )

    await changeRow(user, 1)

    await screen.findByText("Beta Test: app.to")
    await waitFor(() =>
      expect(triggers()[1]!.getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(announcement().textContent).toBe("")
    expect(document.activeElement).toBe(triggers()[1])
  })
})
