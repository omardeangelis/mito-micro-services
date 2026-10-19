import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@/server/services/contact/getContacts"
import {
  defaultState,
  parse,
  type ContactsListState,
} from "../../_lib/searchParams"
import { ContactFilters } from "../ContactFilters"
import { ContactsListShell } from "../ContactsListShell"
import { ContactsTable } from "../ContactsTable"

// The list as the page puts it together: the filters bar and the table in one
// shell, with the address of the page following every navigation (it lands in
// the same transition, as in the app). What each control leaves on screen is
// what these tests look at.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  land: (_href: string) => undefined as void,
}))

const router = {
  push: (href: string) => {
    mocks.push(href)
    mocks.land(href)
  },
  replace: (href: string) => {
    mocks.replace(href)
    mocks.land(href)
  },
  refresh: mocks.refresh,
}
vi.mock("next/navigation", () => ({ useRouter: () => router }))

// A plain anchor that never navigates: the handlers do
vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
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
vi.mock("../ContactColumnsMenu", () => ({ ContactColumnsMenu: () => null }))
vi.mock("../ContactRowState", () => ({
  ContactRowState: () => <div className="w-40" />,
}))

const now = new Date("2026-10-15T10:00:00Z")

const row: ContactRow = {
  id: 101,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: new Date("2026-10-03T08:00:00Z"),
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

/** 3 pages of 20; "Con alert" matches nothing, the other filters keep the rows */
const TOTAL = 45

const parseHref = (href: string) =>
  parse(Object.fromEntries(new URL(href, "http://x").searchParams))

function List({ initial }: { initial: ContactsListState }) {
  const [state, setState] = useState(initial)
  mocks.land = (href) => setState(parseHref(href))

  const empty = state.hasAlert || state.page > 3
  const customerFilter =
    state.customerId === undefined
      ? null
      : {
          found: true as const,
          id: state.customerId,
          name: "Mario",
          surname: "Rossi",
          totalContacts: TOTAL,
        }

  return (
    <ContactsListShell>
      <ContactFilters
        state={state}
        operators={[]}
        customerFilter={customerFilter}
      />
      <ContactsTable
        contacts={empty ? [] : [row]}
        total={empty ? (state.hasAlert ? 0 : TOTAL) : TOTAL}
        state={state}
        hiddenColumns={[]}
        now={now}
        customerFilter={customerFilter}
      />
    </ContactsListShell>
  )
}

const setup = (initial: ContactsListState = defaultState) => {
  const user = userEvent.setup()
  render(<List initial={initial} />)
  return user
}

const table = () => screen.getByRole("table")

/** The address of the first call to a router mock */
const firstHref = (mock: { mock: { calls: unknown[][] } }) =>
  mock.mock.calls[0]![0] as string

// Longer than the quiet time of the search (300 ms)
const afterTheSearchDelay = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)))

beforeEach(() => {
  mocks.push.mockClear()
  mocks.replace.mockClear()
})

describe("il focus quando il controllo usato si toglie da solo (B3, P17)", () => {
  it("'Precedente' verso la prima pagina: il focus va alla tabella", async () => {
    const user = setup({ ...defaultState, page: 2 })
    const previous = screen.getByRole("link", { name: "Pagina precedente" })
    previous.focus()

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Pagina precedente" })).toBeNull()
    expect(document.activeElement).toBe(table())
  })

  it("'Successiva' verso l'ultima pagina: il focus va alla tabella", async () => {
    const user = setup({ ...defaultState, page: 2 })
    screen.getByRole("link", { name: "Pagina successiva" }).focus()

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Pagina successiva" })).toBeNull()
    expect(document.activeElement).toBe(table())
  })

  it("'Rimuovi il filtro cliente': il focus va alla tabella", async () => {
    const user = setup({ ...defaultState, customerId: "c1" })
    screen.getByRole("button", { name: "Rimuovi il filtro cliente" }).focus()

    await user.keyboard("{Enter}")

    expect(
      screen.queryByRole("button", { name: "Rimuovi il filtro cliente" })
    ).toBeNull()
    expect(document.activeElement).toBe(table())
  })

  it("'Azzera filtri': il focus va alla tabella", async () => {
    const user = setup({ ...defaultState, hasAlert: true })
    screen.getByRole("link", { name: "Azzera filtri" }).focus()

    await user.keyboard("{Enter}")

    expect(screen.queryByRole("link", { name: "Azzera filtri" })).toBeNull()
    expect(document.activeElement).toBe(table())
  })

  it("'Vai alla prima pagina': il focus va alla tabella", async () => {
    const user = setup({ ...defaultState, page: 5 })
    screen.getByRole("link", { name: "Vai alla prima pagina" }).focus()

    await user.keyboard("{Enter}")

    expect(
      screen.queryByRole("link", { name: "Vai alla prima pagina" })
    ).toBeNull()
    expect(document.activeElement).toBe(table())
  })

  it("un controllo che resta (2 verso 3) tiene il focus", async () => {
    const user = setup({ ...defaultState, page: 1 })
    const next = screen.getByRole("link", { name: "Pagina successiva" })
    next.focus()

    await user.keyboard("{Enter}")

    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Pagina successiva" })
    )
  })
})

describe("la ricerca scritta e non ancora inviata, con un altro controllo (M6)", () => {
  const type = async (user: ReturnType<typeof setup>, text: string) => {
    await user.click(screen.getByRole("searchbox", { name: "Cerca cliente" }))
    await user.keyboard(text)
  }

  it("l'ordinamento di una colonna porta con sé la ricerca e la lista resta filtrata", async () => {
    const user = setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("button", { name: "Creato" }))

    expect(mocks.push).toHaveBeenCalledTimes(1)
    const href = firstHref(mocks.push)
    expect(href).toContain("q=verdi")
    expect(href).toContain("ordina=creato")
    // The 300 ms run out afterwards: nothing more goes to the address
    await afterTheSearchDelay()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(
      screen.getByRole<HTMLInputElement>("searchbox", { name: "Cerca cliente" })
        .value
    ).toBe("verdi")
  })

  it("'Successiva' porta con sé la ricerca", async () => {
    const user = setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("link", { name: "Pagina successiva" }))

    const href = firstHref(mocks.push)
    expect(href).toContain("q=verdi")
    expect(href).toContain("pagina=2")
  })

  it("il numero di righe porta con sé la ricerca", async () => {
    const user = setup()
    await type(user, "verdi")

    await user.click(screen.getByRole("combobox", { name: "Righe per pagina" }))
    await user.click(screen.getByRole("option", { name: "50" }))

    const href = firstHref(mocks.push)
    expect(href).toContain("q=verdi")
    expect(href).toContain("per_pagina=50")
  })

  it("'Azzera filtri' toglie anche il testo che nessun indirizzo ha ancora", async () => {
    const user = setup({ ...defaultState, hasAlert: true })
    await type(user, "verdi")

    await user.click(screen.getByRole("link", { name: "Azzera filtri" }))
    await afterTheSearchDelay()

    expect(
      screen.getByRole<HTMLInputElement>("searchbox", { name: "Cerca cliente" })
        .value
    ).toBe("")
    expect(mocks.replace).not.toHaveBeenCalledWith(
      expect.stringContaining("q=verdi")
    )
  })
})
