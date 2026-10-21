import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type GetContactByIdResult } from "@mito/server/services/contact/getContactById"
import { ContactDetailContent } from "../ContactDetailContent"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  focusStateTriggerOnNextMount: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => {
      mocks.push(href)
    },
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// The shell is tested on its own: here it is the API the content calls
vi.mock("../../../_components/ContactSheet", () => ({
  useContactSheet: () => ({
    announce: vi.fn(),
    announceAlert: vi.fn(),
    focusStateTriggerOnNextMount: mocks.focusStateTriggerOnNextMount,
    consumeStateTriggerFocus: () => false,
    focusTitle: vi.fn(),
  }),
}))

// The control of the state has its own test (it calls the server); here it is
// the saved value it shows
vi.mock("../ContactStateControl", () => ({
  ContactStateControl: ({ state }: { state: string | null }) => (
    <span>{state ?? "nessuno"}</span>
  ),
}))

// The controls that change the contact have their own tests (they call the
// server): here the priority is its label, and the others are not shown
vi.mock("../ContactPriorityControl", () => ({
  ContactPriorityControl: ({
    customPriority,
  }: {
    customPriority: boolean | null
  }) => <span>{customPriority === true ? "Manuale" : "Automatica"}</span>,
}))
vi.mock("../ContactAlertCloseButton", () => ({
  ContactAlertCloseButton: () => null,
}))
vi.mock("../ContactOperatorControl", () => ({
  ContactOperatorControl: () => null,
}))

// The callback form has its own test (it calls the server)
vi.mock("../ContactCallbackForm", () => ({ ContactCallbackForm: () => null }))

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react")
  return {
    default: forwardRef<
      HTMLAnchorElement,
      React.ComponentProps<"a"> & { prefetch?: boolean; scroll?: boolean }
    >(function LinkMock(
      { href, children, onClick, prefetch: _p, scroll: _s, ...rest },
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

const dataOf = (
  overrides: Partial<GetContactByIdResult> = {}
): GetContactByIdResult => ({
  contact: {
    id: 101,
    state: "richiamare",
    priority: 70,
    customPriority: true,
    isActive: true,
    closedAt: new Date("2026-10-03T08:00:00Z"),
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-02T09:00:00Z"),
    operator: { id: 9, name: "Giulia", surname: "Bianchi" },
  },
  customer: {
    id: "c1",
    name: "Mario",
    surname: "Rossi",
    phoneNumber: "333 1234567",
    fiscalCode: "RSSMRA80A01H501U",
    vatCode: null,
    blackListStatus: "whitelisted",
    operatorId: 9,
  },
  alert: {
    id: 5,
    deadline: new Date("2026-10-20T22:00:00Z"),
    message: "Richiamare dopo le 15",
  },
  history: [
    {
      id: 3,
      deadline: new Date("2026-09-25T22:00:00Z"),
      message: "Prima chiamata",
      updatedAt: new Date("2026-09-26T09:30:00Z"),
      resolvedByName: "Anna",
      resolvedBySurname: "Verdi",
    },
  ],
  customerContacts: [],
  activeTaskId: null,
  editability: { kind: "editable" },
  canReassign: false,
  ...overrides,
})

const renderContent = (
  data: GetContactByIdResult = dataOf(),
  da: string | undefined = undefined
) => {
  const user = userEvent.setup()
  render(<ContactDetailContent data={data} da={da} />)
  return user
}

beforeEach(() => {
  mocks.push.mockClear()
  mocks.focusStateTriggerOnNextMount.mockClear()
})

describe("il contenuto del dettaglio (AC24, AC28)", () => {
  it("mostra gli stessi dati della riga", () => {
    renderContent()

    expect(screen.getByRole("heading", { name: "Rossi Mario" })).toBeTruthy()
    expect(screen.getByText("333 1234567")).toBeTruthy()
    expect(screen.getByText("RSSMRA80A01H501U")).toBeTruthy()
    expect(screen.getByText("richiamare")).toBeTruthy()
    expect(screen.getByText("Giulia Bianchi")).toBeTruthy()
    expect(screen.getByText("3/10/2026")).toBeTruthy()
    expect(screen.getByText("1/10/2026")).toBeTruthy()
    expect(screen.getByText("2/10/2026")).toBeTruthy()
  })

  it("mostra la partita IVA al posto del codice fiscale, e 'Non assegnato' senza operatore", () => {
    const base = dataOf()
    renderContent(
      dataOf({
        customer: {
          ...base.customer,
          fiscalCode: null,
          vatCode: "01234567890",
        },
        contact: { ...base.contact, operator: null },
      })
    )

    expect(screen.getByText("01234567890")).toBeTruthy()
    expect(screen.getAllByText("Non assegnato").length).toBeGreaterThan(0)
  })

  it("ha il pulsante 'Apri scheda cliente' verso la scheda", () => {
    renderContent()

    expect(
      screen
        .getByRole("link", { name: "Apri scheda cliente" })
        .getAttribute("href")
    ).toBe("/dashboard/customers/c1")
  })

  it("mostra il badge blacklist accanto al nome solo se lo stato non è neutro (D7)", () => {
    const base = dataOf()
    const { unmount } = render(
      <ContactDetailContent
        data={dataOf({
          customer: { ...base.customer, blackListStatus: "blacklisted" },
        })}
        da={undefined}
      />
    )
    expect(screen.getByRole("img", { name: /blacklist/i })).toBeTruthy()
    unmount()

    renderContent()
    expect(screen.queryByRole("img", { name: /blacklist/i })).toBeNull()
  })

  it.each([
    [true, "Manuale"],
    [false, "Automatica"],
    [null, "Automatica"],
  ])(
    "con customPriority %s dice '%s' accanto alla priorità (AC42, AC43)",
    (customPriority, label) => {
      const base = dataOf()
      renderContent(dataOf({ contact: { ...base.contact, customPriority } }))

      expect(screen.getByText(label)).toBeTruthy()
    }
  )

  it("mostra l'alert aperto con la scadenza e il messaggio (AC28)", () => {
    renderContent()

    const section = screen.getByRole("region", { name: "Prossimo alert" })
    expect(
      // 22:00Z of the 20th is already the 21st in Italy, in any zone
      within(section).getByText("21/10/2026")
    ).toBeTruthy()
    expect(within(section).getByText("Richiamare dopo le 15")).toBeTruthy()
  })

  it("senza un alert aperto lo dice", () => {
    renderContent(dataOf({ alert: null }))

    expect(
      within(screen.getByRole("region", { name: "Prossimo alert" })).getByText(
        "Nessun alert aperto"
      )
    ).toBeTruthy()
  })

  it("mostra lo Storico degli alert chiusi, con chi li ha chiusi e quando (AC28)", () => {
    renderContent()

    const history = screen.getByRole("region", { name: "Storico" })
    expect(within(history).getByText("Prima chiamata")).toBeTruthy()
    expect(
      within(history).getByText("Chiuso da Anna Verdi il 26/9/2026")
    ).toBeTruthy()
  })

  it("nello Storico un alert chiuso senza utente è chiuso dal sistema", () => {
    const base = dataOf()
    renderContent(
      dataOf({
        history: [
          {
            ...base.history[0]!,
            resolvedByName: null,
            resolvedBySurname: null,
          },
        ],
      })
    )

    expect(
      within(screen.getByRole("region", { name: "Storico" })).getByText(
        "Chiuso dal sistema il 26/9/2026"
      )
    ).toBeTruthy()
  })

  it("senza alert chiusi lo Storico lo dice", () => {
    renderContent(dataOf({ history: [] }))

    expect(
      within(screen.getByRole("region", { name: "Storico" })).getByText(
        "Nessun alert chiuso"
      )
    ).toBeTruthy()
  })
})

describe("il contatto in sola lettura (AC27, AC51)", () => {
  it("di un collega dice a chi è assegnato", () => {
    renderContent(
      dataOf({ editability: { kind: "not_owner", assignee: "Giulia Bianchi" } })
    )

    expect(screen.getByText("Assegnato a Giulia Bianchi")).toBeTruthy()
    expect(screen.queryByText("Contatto concluso")).toBeNull()
  })

  it("non assegnato dice 'Non assegnato'", () => {
    renderContent(
      dataOf({ editability: { kind: "not_owner", assignee: null } })
    )

    expect(screen.getAllByText("Non assegnato").length).toBeGreaterThan(0)
  })

  it("editabile non mostra nessun motivo", () => {
    renderContent()

    expect(screen.queryByText(/^Assegnato a/)).toBeNull()
    expect(screen.queryByText("Contatto concluso")).toBeNull()
  })

  describe("superato", () => {
    const superseded = (activeTaskId: number | null) =>
      dataOf({
        editability: { kind: "superseded" },
        activeTaskId,
        contact: { ...dataOf().contact, isActive: false },
      })

    it("avvisa e porta al contatto attivo, nella stessa vista della lista", async () => {
      const user = renderContent(superseded(202), "stato=richiamare&pagina=2")

      expect(screen.getByText("Contatto concluso")).toBeTruthy()
      const link = screen.getByRole("link", { name: "Vai al contatto attivo" })
      expect(link.getAttribute("href")).toBe(
        "/dashboard/contatti/202?da=stato%3Drichiamare%26pagina%3D2"
      )

      await user.click(link)
      // The focus goes to the state selector of the new contact when it mounts
      expect(mocks.focusStateTriggerOnNextMount).toHaveBeenCalledTimes(1)
    })

    it("senza un contatto attivo non offre il link", () => {
      renderContent(superseded(null))

      expect(screen.getByText("Contatto concluso")).toBeTruthy()
      expect(
        screen.queryByRole("link", { name: "Vai al contatto attivo" })
      ).toBeNull()
    })
  })
})

describe("i contatti precedenti del cliente (AC80)", () => {
  const previous = [
    {
      id: 88,
      state: "erogata" as const,
      isActive: false,
      closedAt: new Date("2026-09-26T09:00:00Z"),
      createdAt: new Date("2026-09-20T08:00:00Z"),
      operator: { id: 4, name: "Anna", surname: "Verdi" },
    },
    {
      id: 77,
      state: "non interessato" as const,
      isActive: false,
      closedAt: null,
      createdAt: new Date("2026-09-10T08:00:00Z"),
      operator: null,
    },
  ]

  it("si vedono sempre, anche per un contatto attivo e modificabile", () => {
    renderContent(dataOf({ customerContacts: previous }))

    const section = screen.getByRole("region", { name: "Contatti precedenti" })
    const items = within(section).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText("erogata")).toBeTruthy()
    expect(within(items[0]!).getByText("Anna Verdi")).toBeTruthy()
    expect(within(items[0]!).getByText(/26\/9\/2026/)).toBeTruthy()
    expect(within(items[0]!).getByText(/20\/9\/2026/)).toBeTruthy()
    expect(within(items[1]!).getByText("non interessato")).toBeTruthy()
    expect(within(items[1]!).getByText("Non assegnato")).toBeTruthy()
  })

  it("ogni voce apre quel contatto, con lo stato della lista", async () => {
    renderContent(
      dataOf({ customerContacts: previous }),
      "stato=richiamare&precedenti=1"
    )

    const link = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getAllByRole("link")[0]!

    expect(link.getAttribute("href")).toBe(
      "/dashboard/contatti/88?da=stato%3Drichiamare%26precedenti%3D1"
    )
  })

  it("senza altri contatti lo dice", () => {
    renderContent(dataOf({ customerContacts: [] }))

    const section = screen.getByRole("region", { name: "Contatti precedenti" })
    expect(within(section).getByText("Nessun contatto precedente")).toBeTruthy()
    expect(within(section).queryByRole("listitem")).toBeNull()
  })

  it("da un contatto concluso il contatto attivo è nell'elenco e si riconosce", () => {
    renderContent(
      dataOf({
        editability: { kind: "superseded" },
        activeTaskId: 120,
        customerContacts: [
          {
            id: 120,
            state: "chiamare",
            isActive: true,
            closedAt: null,
            createdAt: new Date("2026-10-05T08:00:00Z"),
            operator: { id: 9, name: "Giulia", surname: "Bianchi" },
          },
          ...previous,
        ],
      })
    )

    const items = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getAllByRole("listitem")
    expect(within(items[0]!).getByText("Attivo")).toBeTruthy()
    expect(within(items[1]!).queryByText("Attivo")).toBeNull()
  })

  it("un clic su una voce porta il focus al contatto che si apre, come 'Vai al contatto attivo'", async () => {
    const user = renderContent(dataOf({ customerContacts: previous }))

    await user.click(
      within(
        screen.getByRole("region", { name: "Contatti precedenti" })
      ).getAllByRole("link")[0]!
    )

    expect(mocks.focusStateTriggerOnNextMount).toHaveBeenCalledTimes(1)
  })
})
