import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  type CustomerFilter,
  type ContactRow,
} from "@mito/server/services/contact/getContacts"
import { saveReturnFocus } from "../../_lib/returnFocus"
import {
  defaultState,
  type ContactsListState,
} from "@mito/client/contact/searchParams"
import { ContactsListShell } from "../ContactsListShell"
import { ContactsTable } from "../ContactsTable"

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

// A plain anchor that never navigates: `router.push` is what the tests look at
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
  useToast: () => ({ toast: vi.fn() }),
}))

// The menu of the hidden columns has its own tests (it needs the preference store)
vi.mock("../ContactColumnsMenu", () => ({ ContactColumnsMenu: () => null }))

// The cell of the state has its own tests (it calls the server): here it is the
// saved value, and "Concluso" for a contact that is no longer the active one
vi.mock("../ContactRowState", () => ({
  ContactRowState: ({
    contact,
  }: {
    contact: { state: string | null; isActive: boolean }
  }) => (
    <div className="w-40">
      <span>{contact.state ?? "nessuno"}</span>
      {contact.isActive ? null : <span>Concluso</span>}
    </div>
  ),
}))

const now = new Date("2026-10-15T10:00:00Z")

const contact: ContactRow = {
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: 9, name: "Giulia", surname: "Bianchi" },
  customer: {
    id: "c1",
    name: "Mario",
    surname: "Rossi",
    phoneNumber: "333 1234567",
    fiscalCode: "RSSMRA80A01H501U",
    vatCode: null,
    blackListStatus: "whitelisted",
    operatorId: 7,
  },
  alert: null,
}

type Props = React.ComponentProps<typeof ContactsTable>

const renderTable = (props: Partial<Props> = {}) => {
  const user = userEvent.setup()
  render(
    <ContactsListShell>
      <ContactsTable
        contacts={[]}
        total={0}
        state={defaultState}
        hiddenColumns={[]}
        now={now}
        {...props}
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
  totalContacts: 0,
  ...overrides,
})

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
  sessionStorage.clear()
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe("la tabella dei contatti: stati vuoti", () => {
  it("con una pagina oltre l'ultima offre il link alla prima, con gli stessi filtri (AC19)", async () => {
    const user = renderTable({
      state: { ...defaultState, states: ["chiamare"], page: 99 },
      total: 95,
    })

    const link = screen.getByRole("link", { name: "Vai alla prima pagina" })
    expect(link.getAttribute("href")).toBe("/dashboard/contatti?stato=chiamare")
    await user.click(link)
    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(mocks.push).toHaveBeenCalledWith(
      "/dashboard/contatti?stato=chiamare"
    )
  })

  it("oltre l'ultima pagina il contatore non finge un intervallo e 'Precedente' porta all'ultima (AC19)", () => {
    renderTable({
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
    const user = renderTable({
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
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/contatti")
  })

  it("col solo 'Solo i miei' dice 'Non hai contatti assegnati' (A13)", () => {
    renderTable({ state: { ...defaultState, onlyMe: true } })

    expect(screen.getByText("Non hai contatti assegnati")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("con altri filtri oltre a 'Solo i miei' non dice 'Non hai contatti assegnati'", () => {
    renderTable({ state: { ...defaultState, onlyMe: true, hasAlert: true } })

    expect(screen.queryByText("Non hai contatti assegnati")).toBeNull()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("per un cliente senza contatti lo dice e rimanda alla scheda cliente (AC23)", () => {
    renderTable({
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

  it("lo dice anche con altri filtri attivi: conta il totale del cliente, non la lista vuota", () => {
    renderTable({
      state: { ...defaultState, customerId: "c1", states: ["chiamare"] },
      customerFilter: customerFilterOf({ totalContacts: 0 }),
    })

    expect(screen.getByText("Questo cliente non ha contatti")).toBeTruthy()
  })

  it("per un cliente con soli contatti precedenti, esclusi, non dice che non ha contatti", () => {
    renderTable({
      state: { ...defaultState, customerId: "c1" },
      customerFilter: customerFilterOf({ totalContacts: 3 }),
    })

    expect(screen.queryByText("Questo cliente non ha contatti")).toBeNull()
    expect(screen.getByRole("link", { name: "Azzera filtri" })).toBeTruthy()
  })

  it("per un cliente che non esiste dice 'Cliente non trovato' (AC23)", () => {
    renderTable({
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

  it("non mostra nessun messaggio quando ci sono contatti", () => {
    renderTable({
      contacts: [contact],
      total: 1,
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

  it("porta il focus sul menu azioni della riga da cui si era partiti", () => {
    saveReturnFocus(101)

    renderTable({ contacts: [contact], total: 1, state })

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Azioni per Rossi Mario" })
    )
  })

  it("se la riga non c'è più, porta il focus sulla tabella, mai su body", () => {
    saveReturnFocus(555)

    renderTable({ contacts: [contact], total: 1, state })

    const table = screen.getByRole("table")
    expect(document.activeElement).toBe(table)
    expect(table.getAttribute("tabindex")).toBe("-1")
  })

  it("non sposta il focus se non si arriva da un dettaglio", () => {
    renderTable({ contacts: [contact], total: 1, state })

    expect(document.activeElement).toBe(document.body)
  })

  it("trova la riga anche con i menu delle altre righe presenti", () => {
    saveReturnFocus(102)
    const second: ContactRow = {
      ...contact,
      id: 102,
      customer: {
        ...contact.customer,
        id: "c2",
        surname: "Verdi",
        name: "Anna",
      },
    }

    renderTable({ contacts: [contact, second], total: 2, state })

    expect(document.activeElement).toBe(
      within(screen.getByRole("table")).getByRole("button", {
        name: "Azioni per Verdi Anna",
      })
    )
  })
})
