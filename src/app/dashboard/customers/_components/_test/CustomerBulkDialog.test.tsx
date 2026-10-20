import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { CustomerBulkDialog } from "../CustomerBulkDialog"

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  withAlert: [] as unknown[],
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getAllUniqueOperators: {
        useQuery: () => ({
          data: [
            { id: 1, name: "Anna", surname: "Verdi" },
            { id: 2, name: "Mario", surname: "Rossi" },
          ],
          isLoading: false,
        }),
      },
    },
    task: {
      getCustomersWithActiveAlerts: {
        useQuery: () => ({ data: mocks.withAlert, isLoading: false }),
      },
    },
  },
}))

// A server action: it pulls in `src/trpc/server.ts`, which needs Next's runtime
vi.mock("../../_actions/customerBulkUpdate", () => ({
  customerBulkUpdateAction: mocks.action,
}))

// Le etichette vecchie, che il dialogo non deve più mostrare (AC63)
const OLD_LABELS = [
  "Assegna Chiamate",
  "Assegna chiamate",
  "Assegnazione Massiva delle Chiamate",
  "Assegnazione chiamate in corso",
  "Chiamate assegnate",
  "Creazione delle chiamate",
  "chiamata/e create",
  "Assegna solo il cliente a un operatore",
  "né modificare lo stato delle chiamate esistenti",
]

// Quello che "Assegna Clienti" fa davvero (AC75)
const CLIENTI_EXPORT_NOTE =
  "Le chiamate già registrate sul contatto passano al nuovo operatore nell'export; i contatti non attivi restano a chi li ha lavorati."

const bodyText = () => document.body.textContent ?? ""

const expectNoOldLabels = () => {
  for (const label of OLD_LABELS) {
    expect(bodyText()).not.toContain(label)
  }
}

const setup = async () => {
  const user = userEvent.setup()
  render(<CustomerBulkDialog onClose={vi.fn()} />)
  // The dialog reads the selection from the store as it changes
  act(() => {
    useCustomerTableStore.setState({ bulkActionDialogOpen: true })
  })
  act(() => {
    useCustomerTableStore.setState({ selectedCustomer: ["c-1", "c-2", "c-3"] })
  })
  await screen.findByText("Cosa vuoi assegnare?")
  return user
}

const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  card: "Crea/assegna contatti" | "Assegna Clienti"
) => {
  await user.click(screen.getByRole("button", { name: new RegExp(card) }))
}

const pickOperator = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string
) => {
  await user.click(screen.getByRole("combobox"))
  await user.click(await screen.findByRole("option", { name }))
}

beforeEach(() => {
  mocks.action.mockReset()
  mocks.withAlert = []
})

afterEach(() => {
  act(() => {
    useCustomerTableStore.setState({
      bulkActionDialogOpen: false,
      selectedCustomer: [],
    })
  })
})

describe("CustomerBulkDialog, la scelta del tipo", () => {
  it("offre 'Crea/assegna contatti' e 'Assegna Clienti', e non più 'Assegna chiamate'", async () => {
    await setup()

    const create = screen.getByRole("button", {
      name: /Crea\/assegna contatti/,
    })
    expect(within(create).getByText("Crea/assegna contatti")).toBeTruthy()
    expect(
      within(create).getByText(
        "Crea un contatto da chiamare per ogni cliente e lo assegna all'operatore."
      )
    ).toBeTruthy()
    expectNoOldLabels()
  })

  it("la scheda 'Assegna Clienti' dice che si sposta anche il contatto attivo, in ogni stato, e cosa succede all'export (AC75)", async () => {
    await setup()

    const assign = screen.getByRole("button", { name: /Assegna Clienti/ })
    expect(within(assign).getByText("Assegna Clienti")).toBeTruthy()
    expect(
      within(assign).getByText(
        `Sposta il cliente e il suo contatto attivo, in qualunque stato, all'operatore. Non crea contatti. ${CLIENTI_EXPORT_NOTE}`
      )
    ).toBeTruthy()
    expectNoOldLabels()
  })
})

describe("CustomerBulkDialog, 'Crea/assegna contatti'", () => {
  it("titolo, descrizione e pulsante dicono 'Crea/assegna contatti'", async () => {
    const user = await setup()
    await choose(user, "Crea/assegna contatti")

    expect(
      screen.getByRole("heading", { name: "Crea/assegna contatti" })
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Crea un contatto da chiamare per i clienti selezionati e li assegna all'operatore scelto."
      )
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Crea/assegna contatti" })
    ).toBeTruthy()
    expectNoOldLabels()
  })

  it("l'avviso degli alert parla di contatti, non di chiamate", async () => {
    mocks.withAlert = [
      {
        customerId: "c-1",
        name: "Anna",
        surname: "Rossi",
        alertId: 9,
        deadline: new Date("2026-11-05T09:00:00Z"),
        message: null,
      },
    ]
    const user = await setup()
    await choose(user, "Crea/assegna contatti")

    expect(
      screen.getByText(/creare un nuovo contatto e risolvere l'alert/)
    ).toBeTruthy()
    expectNoOldLabels()
  })

  it("mentre salva i passaggi dicono 'Creazione dei contatti', e alla fine il riepilogo parla di contatti", async () => {
    let finish: (value: unknown) => void = () => undefined
    mocks.action.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const user = await setup()
    await choose(user, "Crea/assegna contatti")
    await pickOperator(user, "Anna Verdi")

    await user.click(
      screen.getByRole("button", { name: "Crea/assegna contatti" })
    )

    expect(await screen.findByText("Creazione dei contatti")).toBeTruthy()
    expect(screen.getByText("Crea/assegna contatti in corso")).toBeTruthy()
    expectNoOldLabels()

    await act(async () => {
      finish({})
    })

    expect(await screen.findByText("Contatti assegnati")).toBeTruthy()
    expect(
      screen.getByText("3 contatto/i creati e assegnati a Anna Verdi.")
    ).toBeTruthy()
    expectNoOldLabels()
  })
})

describe("CustomerBulkDialog, 'Assegna Clienti'", () => {
  it("la descrizione dice che il contatto attivo si sposta con il cliente, senza creare contatti (AC75)", async () => {
    const user = await setup()
    await choose(user, "Assegna Clienti")

    expect(
      screen.getByRole("heading", { name: "Assegna Clienti" })
    ).toBeTruthy()
    expect(
      screen.getByText(
        `Sposta i clienti selezionati, con il loro contatto attivo in qualunque stato, all'operatore scelto, senza creare contatti. ${CLIENTI_EXPORT_NOTE}`
      )
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Assegna clienti" })).toBeTruthy()
    expectNoOldLabels()
  })

  it("il riepilogo finale dice che i clienti sono passati con il loro contatto attivo", async () => {
    mocks.action.mockResolvedValue({})
    const user = await setup()
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Mario Rossi")

    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    await waitFor(() =>
      expect(screen.getByText("Clienti assegnati")).toBeTruthy()
    )
    expect(
      screen.getByText(
        "3 cliente/i assegnati a Mario Rossi, con il loro contatto attivo."
      )
    ).toBeTruthy()
    expectNoOldLabels()
  })

  it("non aggiunge alert da risolvere né il passaggio 'Creazione dei contatti'", async () => {
    let finish: (value: unknown) => void = () => undefined
    mocks.action.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const user = await setup()
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Mario Rossi")
    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    expect(
      await screen.findByText("Assegnazione clienti in corso")
    ).toBeTruthy()
    expect(screen.queryByText("Creazione dei contatti")).toBeNull()
    expectNoOldLabels()

    await act(async () => {
      finish({})
    })
  })
})
