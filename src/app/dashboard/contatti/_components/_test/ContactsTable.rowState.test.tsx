import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type ContactRow } from "@/server/services/contact/getContacts"
import { defaultState, type ContactsListState } from "../../_lib/searchParams"
import { ContactsListShell } from "../ContactsListShell"
import { ContactsTable } from "../ContactsTable"

type Call = {
  vars: Record<string, unknown>
  resolve: (value: { taskId: number; reopened: boolean }) => void
}

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  // What the router refresh does to the page: set by the harness
  onRefresh: () => undefined as void,
  toast: vi.fn(),
}))

vi.mock("@/trpc/react", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    api: {
      task: {
        changeState: {
          useMutation: () =>
            useMutation({
              mutationFn: (vars: Record<string, unknown>) =>
                new Promise<{ taskId: number; reopened: boolean }>(
                  (resolve) => {
                    mocks.calls.push({ vars, resolve })
                  }
                ),
            }),
        },
      },
    },
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => mocks.onRefresh(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock("@/components/custom/contact/useActor", () => ({
  useActor: () => ({ role: "OPERATORE", operatorId: 7 }),
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

// The menu of the hidden columns has its own tests (it needs the preference store)
vi.mock("../ContactColumnsMenu", () => ({ ContactColumnsMenu: () => null }))

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    default: forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a"> & { prefetch?: boolean }
    >(function LinkMock({ href, children, prefetch: _p, ...rest }, ref) {
      return (
        <a ref={ref} href={href} {...rest}>
          {children}
        </a>
      )
    }),
  }
})

const rowOf = (id: number, surname: string): ContactRow => ({
  id,
  state: "chiamare",
  priority: 70,
  isActive: true,
  closedAt: null,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date("2026-10-02T09:00:00Z"),
  operator: { id: 7, name: "Mario", surname: "Verdi" },
  customer: {
    id: `c${id}`,
    name: "Test",
    surname,
    phoneNumber: null,
    fiscalCode: null,
    vatCode: null,
    blackListStatus: "whitelisted",
    operatorId: 7,
  },
  alert: null,
})

const now = new Date("2026-10-15T10:00:00Z")
const filtered: ContactsListState = { ...defaultState, states: ["chiamare"] }

/** The page: the refresh after a save gives the list `afterRefresh`. */
function Page({
  afterRefresh,
  afterTotal,
  previous = [],
  afterPrevious = [],
}: {
  afterRefresh: ContactRow[]
  afterTotal: number
  previous?: ContactRow[]
  afterPrevious?: ContactRow[]
}) {
  const [contacts, setContacts] = useState([
    rowOf(1, "Alfa"),
    rowOf(2, "Beta"),
    rowOf(3, "Gamma"),
  ])
  const [total, setTotal] = useState(3)
  const [previousRows, setPreviousRows] = useState(previous)
  mocks.onRefresh = () => {
    setContacts(afterRefresh)
    setTotal(afterTotal)
    setPreviousRows(afterPrevious)
  }
  return (
    <ContactsListShell>
      <ContactsTable
        contacts={contacts}
        total={total}
        previous={previousRows}
        state={filtered}
        hiddenColumns={[]}
        now={now}
      />
    </ContactsListShell>
  )
}

const setup = (
  afterRefresh: ContactRow[],
  afterTotal: number,
  rest: { previous?: ContactRow[]; afterPrevious?: ContactRow[] } = {}
) => {
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page afterRefresh={afterRefresh} afterTotal={afterTotal} {...rest} />
    </QueryClientProvider>
  )
  return user
}

/** A concluded contact: no state selector, only the badge. */
const concluded = (id: number, surname: string): ContactRow => ({
  ...rowOf(id, surname),
  isActive: false,
  closedAt: new Date("2026-10-03T09:00:00Z"),
})

const triggers = () =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-contact-state-trigger]")
  )

/** The status node that is read aloud: the one that is not the empty state. */
const announcement = () =>
  document.querySelector<HTMLElement>('[role="status"].sr-only')!

beforeEach(() => {
  mocks.calls.length = 0
  mocks.toast.mockClear()
  ;(document.activeElement as HTMLElement | null)?.blur()
})

describe("una riga che esce dai filtri dopo il cambio di stato (A9, P17)", () => {
  const changeSecond = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(triggers()[1]!)
    await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 2, reopened: false })
    })
  }

  it("sparisce, e lo dice a chi usa un lettore di schermo con il nome del cliente e il totale", async () => {
    const user = setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(announcement().textContent).toBe(
      "Il contatto di Beta Test non è più nell'elenco. 2 contatti."
    )
  })

  it("con un solo contatto rimasto dice '1 contatto'", async () => {
    const user = setup([rowOf(1, "Alfa")], 1)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(announcement().textContent).toBe(
      "Il contatto di Beta Test non è più nell'elenco. 1 contatto."
    )
  })

  it("il focus passa al selettore della riga che prende il suo posto, non resta su body", async () => {
    const user = setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    const [first, second] = triggers()
    expect(first).toBeTruthy()
    expect(document.activeElement).toBe(second)
    expect(within(second!.closest("tr")!).getByText("Gamma Test")).toBeTruthy()
  })

  it("se la riga era l'ultima, il focus va al selettore di quella prima", async () => {
    const user = setup([rowOf(1, "Alfa"), rowOf(2, "Beta")], 2)

    await user.click(triggers()[2]!)
    await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 3, reopened: false })
    })

    await waitFor(() => expect(screen.queryByText("Gamma Test")).toBeNull())
    expect(document.activeElement).toBe(triggers()[1])
  })
})

describe("il focus quando le righe vicine non hanno il selettore (P17)", () => {
  const changeSecond = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(triggers()[1]!)
    await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 2, reopened: false })
    })
  }

  it("la riga che prende il posto è di un contatto concluso, senza selettore: il focus salta alla prossima che ce l'ha", async () => {
    const user = setup(
      [rowOf(1, "Alfa"), concluded(9, "Zeta"), rowOf(3, "Gamma")],
      2
    )

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(document.activeElement).toBe(triggers()[1])
    expect(
      within(document.activeElement!.closest("tr")!).getByText("Gamma Test")
    ).toBeTruthy()
  })

  it("se dopo non c'è nessun selettore, il focus va a quello di prima", async () => {
    const user = setup([rowOf(1, "Alfa"), concluded(9, "Zeta")], 1)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(document.activeElement).toBe(triggers()[0])
  })

  it("la riga che esce aveva sotto i contatti precedenti: sono righe senza selettore e il focus va alla riga attiva dopo", async () => {
    const user = setup([rowOf(1, "Alfa"), rowOf(3, "Gamma")], 2, {
      // Of the customer of the second row: it hangs under it
      previous: [
        { ...concluded(20, "Beta"), customer: rowOf(2, "Beta").customer },
      ],
      afterPrevious: [],
    })
    // Alfa, Beta, the previous contact of Beta (nested), Gamma
    expect(document.querySelectorAll("tbody > tr")).toHaveLength(4)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(document.activeElement).toBe(triggers()[1])
    expect(
      within(document.activeElement!.closest("tr")!).getByText("Gamma Test")
    ).toBeTruthy()
  })

  it("quando non resta nessun selettore, il focus va alla tabella e non a body", async () => {
    const user = setup([concluded(9, "Zeta")], 0)

    await changeSecond(user)

    await waitFor(() => expect(screen.queryByText("Beta Test")).toBeNull())
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.tagName).toBe("TABLE")
  })
})

describe("una riga che resta nell'elenco", () => {
  it("non annuncia niente e tiene il focus sul suo selettore", async () => {
    const user = setup(
      [rowOf(1, "Alfa"), rowOf(2, "Beta"), rowOf(3, "Gamma")],
      3
    )

    await user.click(triggers()[1]!)
    await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
    await act(async () => {
      mocks.calls[0]!.resolve({ taskId: 2, reopened: false })
    })

    await waitFor(() =>
      expect(triggers()[1]!.getAttribute("aria-disabled")).not.toBe("true")
    )
    expect(announcement().textContent).toBe("")
    expect(document.activeElement).toBe(triggers()[1])
  })
})
