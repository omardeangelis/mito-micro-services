import { screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { type ContactDetail } from "@mito/contract/task"
import { contactDetail, contactRow, fakeContacts } from "@/test/contacts"
import { currentHref, renderContacts } from "../../_test/page"
import { DA, detailPath, findContent, openDetail, sheet } from "./detail"

// The content of the detail, as the tests of `ContactDetailContent` and
// `ContactNotFound` of the Next.js app, on the page with a backend in memory

const giulia = { id: 9, name: "Giulia", surname: "Bianchi" }

/** The contact of the tests of Next.js: Giulia's, with an open alert */
const dataOf = (overrides: Partial<ContactDetail> = {}): ContactDetail =>
  contactDetail({
    contact: {
      state: "richiamare",
      priority: 70,
      customPriority: true,
      operator: giulia,
    },
    customer: { ...contactRow().customer, operatorId: giulia.id },
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
    ...overrides,
  })

beforeEach(() => {
  sessionStorage.clear()
})

describe("il contenuto del dettaglio (AC24, AC28)", () => {
  it("mostra gli stessi dati della riga", async () => {
    await openDetail([dataOf()])

    expect(screen.getByRole("heading", { name: "Rossi Mario" })).toBeTruthy()
    expect(screen.getByText("333 1234567")).toBeTruthy()
    expect(screen.getByText("RSSMRA80A01H501U")).toBeTruthy()
    expect(screen.getByText("Giulia Bianchi")).toBeTruthy()
    expect(screen.getByText("3/10/2026")).toBeTruthy()
    expect(screen.getByText("1/10/2026")).toBeTruthy()
    expect(screen.getByText("2/10/2026")).toBeTruthy()
  })

  it("mostra la partita IVA al posto del codice fiscale, e 'Non assegnato' senza operatore", async () => {
    const base = dataOf()
    await openDetail([
      dataOf({
        customer: {
          ...base.customer,
          fiscalCode: null,
          vatCode: "01234567890",
        },
        contact: { ...base.contact, operator: null },
      }),
    ])

    expect(screen.getByText("01234567890")).toBeTruthy()
    expect(screen.getAllByText("Non assegnato").length).toBeGreaterThan(0)
  })

  it("ha il pulsante 'Apri scheda cliente' verso la scheda", async () => {
    const { user } = await openDetail([dataOf()])

    const link = screen.getByRole("link", { name: "Apri scheda cliente" })
    expect(link.getAttribute("href")).toBe("/dashboard/customers/c1")
    await user.click(link)
    expect(await screen.findByText("altra pagina")).toBeTruthy()
    expect(currentHref()).toBe("/dashboard/customers/c1")
  })

  it("mostra il badge blacklist accanto al nome solo se lo stato non è neutro (D7)", async () => {
    const base = dataOf()
    await openDetail([
      dataOf({
        customer: { ...base.customer, blackListStatus: "blacklisted" },
      }),
    ])

    expect(screen.getByRole("img", { name: /blacklist/i })).toBeTruthy()
  })

  it("senza blacklist non c'è il badge", async () => {
    await openDetail([dataOf()])

    expect(screen.queryByRole("img", { name: /blacklist/i })).toBeNull()
  })

  it.each([
    [true, "Manuale"],
    [false, "Automatica"],
    [null, "Automatica"],
  ])(
    "con customPriority %s dice '%s' accanto alla priorità (AC42, AC43)",
    async (customPriority, label) => {
      const base = dataOf()
      await openDetail([
        dataOf({ contact: { ...base.contact, customPriority } }),
      ])

      expect(within(sheet()).getAllByText(label).length).toBeGreaterThan(0)
    }
  )

  it("mostra l'alert aperto con la scadenza e il messaggio (AC28)", async () => {
    await openDetail([dataOf()])

    const section = screen.getByRole("region", { name: "Prossimo alert" })
    // 22:00Z of the 20th is already the 21st in Italy, in any zone
    expect(within(section).getByText("21/10/2026")).toBeTruthy()
    expect(within(section).getByText("Richiamare dopo le 15")).toBeTruthy()
  })

  it("senza un alert aperto lo dice", async () => {
    await openDetail([dataOf({ alert: null })])

    expect(
      within(screen.getByRole("region", { name: "Prossimo alert" })).getByText(
        "Nessun alert aperto"
      )
    ).toBeTruthy()
  })

  it("mostra lo Storico degli alert chiusi, con chi li ha chiusi e quando (AC28)", async () => {
    await openDetail([dataOf()])

    const history = screen.getByRole("region", { name: "Storico" })
    expect(within(history).getByText("Prima chiamata")).toBeTruthy()
    expect(
      within(history).getByText("Chiuso da Anna Verdi il 26/9/2026")
    ).toBeTruthy()
  })

  it("nello Storico un alert chiuso senza utente è chiuso dal sistema", async () => {
    const base = dataOf()
    await openDetail([
      dataOf({
        history: [
          {
            ...base.history[0]!,
            resolvedByName: null,
            resolvedBySurname: null,
          },
        ],
      }),
    ])

    expect(
      within(screen.getByRole("region", { name: "Storico" })).getByText(
        "Chiuso dal sistema il 26/9/2026"
      )
    ).toBeTruthy()
  })

  it("senza alert chiusi lo Storico lo dice", async () => {
    await openDetail([dataOf({ history: [] })])

    expect(
      within(screen.getByRole("region", { name: "Storico" })).getByText(
        "Nessun alert chiuso"
      )
    ).toBeTruthy()
  })

  it("sotto il contatto ci sono le note del cliente (AC53)", async () => {
    await openDetail([dataOf()])

    expect(
      await within(sheet()).findByRole("button", { name: "Avvia una chat" })
    ).toBeTruthy()
  })
})

describe("il contatto in sola lettura (AC27, AC51)", () => {
  it("di un collega dice a chi è assegnato, senza i controlli", async () => {
    await openDetail([
      dataOf({
        editability: { kind: "not_owner", assignee: "Giulia Bianchi" },
      }),
    ])

    expect(screen.getByText("Assegnato a Giulia Bianchi")).toBeTruthy()
    expect(screen.queryByText("Contatto concluso")).toBeNull()
    expect(document.querySelector("[data-contact-state-trigger]")).toBeNull()
    expect(
      screen.queryByRole("button", { name: /, cambia priorità$/ })
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Imposta richiamo" })
    ).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Chiudi il richiamo" })
    ).toBeNull()
  })

  it("non assegnato dice 'Non assegnato'", async () => {
    await openDetail([
      dataOf({ editability: { kind: "not_owner", assignee: null } }),
    ])

    expect(screen.getAllByText("Non assegnato").length).toBeGreaterThan(0)
  })

  it("editabile non mostra nessun motivo, e ha i controlli", async () => {
    await openDetail([dataOf()])

    expect(screen.queryByText(/^Assegnato a/)).toBeNull()
    expect(screen.queryByText("Contatto concluso")).toBeNull()
    expect(
      document.querySelector("[data-contact-state-trigger]")
    ).not.toBeNull()
    expect(
      screen.getByRole("button", { name: "Manuale, cambia priorità" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Chiudi il richiamo" })
    ).toBeTruthy()
  })

  describe("superato", () => {
    const superseded = (activeTaskId: number | null) =>
      dataOf({
        editability: { kind: "superseded" },
        activeTaskId,
        contact: { ...dataOf().contact, isActive: false },
      })

    it("avvisa e porta al contatto attivo, nella stessa vista della lista, col focus sul suo stato", async () => {
      const active = contactDetail({
        contact: { id: 202, state: "chiamare" },
      })
      const { user } = await openDetail([superseded(202), active])

      expect(screen.getByText("Contatto concluso")).toBeTruthy()
      const link = screen.getByRole("link", { name: "Vai al contatto attivo" })
      expect(link.getAttribute("href")).toBe(
        "/dashboard/contatti/202?da=stato%3Drichiamare%26pagina%3D2"
      )

      await user.click(link)

      await waitFor(() => expect(currentHref()).toBe(detailPath(202, DA)))
      // The focus goes to the state selector of the new contact when it mounts
      await waitFor(() =>
        expect(document.activeElement).toBe(
          document.querySelector("[data-contact-state-trigger]")
        )
      )
      expect(screen.queryByText("Contatto concluso")).toBeNull()
      // The same sheet: it never closed
      expect(sheet()).toBeTruthy()
    })

    it("senza un contatto attivo non offre il link", async () => {
      await openDetail([superseded(null)])

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

  it("si vedono sempre, anche per un contatto attivo e modificabile", async () => {
    await openDetail([dataOf({ customerContacts: previous })])

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
    await openDetail([dataOf({ customerContacts: previous })], {
      da: "stato=richiamare&precedenti=1",
    })

    const link = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getAllByRole("link")[0]!

    expect(link.getAttribute("href")).toBe(
      "/dashboard/contatti/88?da=stato%3Drichiamare%26precedenti%3D1"
    )
  })

  it("senza altri contatti lo dice", async () => {
    await openDetail([dataOf({ customerContacts: [] })])

    const section = screen.getByRole("region", { name: "Contatti precedenti" })
    expect(within(section).getByText("Nessun contatto precedente")).toBeTruthy()
    expect(within(section).queryByRole("listitem")).toBeNull()
  })

  it("da un contatto concluso il contatto attivo è nell'elenco e si riconosce", async () => {
    await openDetail([
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
            operator: giulia,
          },
          ...previous,
        ],
      }),
    ])

    const items = within(
      screen.getByRole("region", { name: "Contatti precedenti" })
    ).getAllByRole("listitem")
    expect(within(items[0]!).getByText("Attivo")).toBeTruthy()
    expect(within(items[1]!).queryByText("Attivo")).toBeNull()
  })

  it("un clic su una voce apre quel contatto nella stessa finestra, col focus sul suo stato", async () => {
    const editableOld = contactDetail({
      contact: { id: 88, state: "erogata" },
    })
    const { user } = await openDetail([
      dataOf({ customerContacts: previous }),
      editableOld,
    ])

    await user.click(
      within(
        screen.getByRole("region", { name: "Contatti precedenti" })
      ).getAllByRole("link")[0]!
    )

    await waitFor(() => expect(currentHref()).toBe(detailPath(88, DA)))
    await waitFor(() =>
      expect(
        document
          .querySelector("[data-contact-state-trigger]")
          ?.getAttribute("aria-label")
      ).toBe("erogata, cambia stato")
    )
    expect(document.activeElement).toBe(
      document.querySelector("[data-contact-state-trigger]")
    )
  })
})

describe("il contatto che non esiste (AC26)", () => {
  it("lo dice dentro la finestra e rimanda a Contatti, alla vista di prima", async () => {
    const backend = fakeContacts()
    const { user } = renderContacts(detailPath(999, DA), backend, {
      detail: true,
    })

    expect(
      await within(await screen.findByRole("dialog")).findByText(
        "Contatto non trovato"
      )
    ).toBeTruthy()
    const back = screen.getByRole("link", { name: "Torna a Contatti" })
    expect(back.getAttribute("href")).toBe(
      "/dashboard/contatti?stato=richiamare&pagina=2"
    )
    // No toast: the page says it
    expect(screen.queryAllByText("Contatto non trovato")).toHaveLength(1)

    await user.click(back)
    await waitFor(() =>
      expect(currentHref()).toBe(
        "/dashboard/contatti?stato=richiamare&pagina=2"
      )
    )
    expect(await screen.findByRole("table", { name: "Contatti" })).toBeTruthy()
  })

  it("senza una vista di prima rimanda alla lista", async () => {
    renderContacts(detailPath(999), fakeContacts(), { detail: true })

    const back = await screen.findByRole("link", { name: "Torna a Contatti" })
    expect(back.getAttribute("href")).toBe("/dashboard/contatti")
  })

  it("un id che non è un contatto è un contatto che non esiste", async () => {
    renderContacts("/dashboard/contatti/abc", fakeContacts(), { detail: true })

    expect(await screen.findByText("Contatto non trovato")).toBeTruthy()
  })
})

describe("quando il dettaglio non si legge", () => {
  it("va all'errore dei contatti, come contatti/error.tsx, e 'Riprova' lo legge di nuovo", async () => {
    const backend = fakeContacts({ details: { 101: contactDetail() } })
    backend.state.failingDetail = true
    const { user } = renderContacts(detailPath(101), backend, { detail: true })

    expect(
      await screen.findByText(
        "Non è stato possibile caricare i contatti",
        undefined,
        { timeout: 3000 }
      )
    ).toBeTruthy()

    backend.state.failingDetail = false
    await user.click(screen.getByRole("button", { name: "Riprova" }))

    await findContent()
    expect(screen.getByRole("heading", { name: "Rossi Mario" })).toBeTruthy()
  })

  it("per l'amministratore anche gli operatori servono: senza va all'errore", async () => {
    const backend = fakeContacts({
      details: { 101: contactDetail({ canReassign: true }) },
    })
    backend.state.failingOperators = true
    renderContacts(detailPath(101), backend, { detail: true, role: "ADMIN" })

    expect(
      await screen.findByText(
        "Non è stato possibile caricare i contatti",
        undefined,
        { timeout: 3000 }
      )
    ).toBeTruthy()
  })
})
