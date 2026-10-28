import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type ActiveAlert } from "@mito/contract/task"
import { useCustomerTableStore } from "@/store/useCustomerTableStore"
import { fakeCustomers, operatorWithRole } from "@/test/customers"
import { renderCustomers } from "../../_test/page"
import { CustomerBulkDialog } from "../CustomerBulkDialog"

/** The backend of the dialog: three operators, and the alerts of the test */
const backendFor = (alerts: ActiveAlert[] = []) =>
  fakeCustomers({
    operators: [
      operatorWithRole(1, "Anna", "Verdi"),
      operatorWithRole(2, "Mario", "Rossi"),
      // Real operators carry trailing spaces in name and surname
      operatorWithRole(3, "Francesca ", "Colombo Zefinetti "),
    ],
    alerts,
  })

/** Holds the assignments of `backend` until the returned function runs */
const hold = (backend: ReturnType<typeof fakeCustomers>) => {
  let release: () => void = () => undefined
  backend.state.gate = new Promise((resolve) => {
    release = resolve
  })
  return () => act(async () => release())
}

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

const setup = async (backend = backendFor()) => {
  const user = userEvent.setup()
  renderCustomers("/dashboard/customers", backend, {
    ui: <CustomerBulkDialog onClose={vi.fn()} />,
  })
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
    const user = await setup(
      backendFor([
        {
          customerId: "c-1",
          name: "Anna",
          surname: "Rossi",
          alertId: 9,
          deadline: new Date("2026-11-05T09:00:00Z"),
          message: null,
          state: "richiamare",
        },
      ])
    )
    await choose(user, "Crea/assegna contatti")

    expect(
      await screen.findByText(/creare un nuovo contatto e risolvere l'alert/)
    ).toBeTruthy()
    expectNoOldLabels()
  })

  it("mentre salva i passaggi dicono 'Creazione dei contatti', e alla fine il riepilogo parla di contatti", async () => {
    const backend = backendFor()
    const finish = hold(backend)
    const user = await setup(backend)
    await choose(user, "Crea/assegna contatti")
    await pickOperator(user, "Anna Verdi")

    await user.click(
      screen.getByRole("button", { name: "Crea/assegna contatti" })
    )

    expect(await screen.findByText("Creazione dei contatti")).toBeTruthy()
    expect(screen.getByText("Crea/assegna contatti in corso")).toBeTruthy()
    expectNoOldLabels()

    await finish()

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

  it("il nome dell'operatore nel riepilogo non ha spazi in più, prima della virgola", async () => {
    const user = await setup()
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Francesca Colombo Zefinetti")

    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    await waitFor(() =>
      expect(screen.getByText("Clienti assegnati")).toBeTruthy()
    )
    expect(
      screen.getByText(
        "3 cliente/i assegnati a Francesca Colombo Zefinetti, con il loro contatto attivo."
      )
    ).toBeTruthy()
  })

  it("non aggiunge alert da risolvere né il passaggio 'Creazione dei contatti'", async () => {
    const backend = backendFor()
    const finish = hold(backend)
    const user = await setup(backend)
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Mario Rossi")
    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    expect(
      await screen.findByText("Assegnazione clienti in corso")
    ).toBeTruthy()
    expect(screen.queryByText("Creazione dei contatti")).toBeNull()
    expectNoOldLabels()

    await finish()
  })
})

// What the dialog sends: the calls of the Next.js app's server action, now
// straight to the backend

describe("CustomerBulkDialog, le chiamate al backend", () => {
  it("senza operatore non si può assegnare", async () => {
    const user = await setup()
    await choose(user, "Assegna Clienti")

    expect(
      screen.getByRole("button", { name: "Assegna clienti" })
    ).toBeDisabled()
    await pickOperator(user, "Mario Rossi")
    expect(
      screen.getByRole("button", { name: "Assegna clienti" })
    ).toBeEnabled()
  })

  it("'Crea/assegna contatti' crea contatti da chiamare e risolve solo gli alert spuntati", async () => {
    const backend = backendFor([
      {
        customerId: "c-1",
        name: "Anna",
        surname: "Rossi",
        alertId: 9,
        deadline: new Date("2026-11-05T09:00:00Z"),
        message: null,
        state: "richiamare",
      },
      {
        customerId: "c-2",
        name: "Bruno",
        surname: "Bianchi",
        alertId: 10,
        deadline: new Date("2026-11-06T09:00:00Z"),
        message: "dopo le 18",
        state: "richiamare",
      },
    ])
    const user = await setup(backend)
    await choose(user, "Crea/assegna contatti")
    await pickOperator(user, "Anna Verdi")
    await user.click(
      await screen.findByRole("checkbox", { name: /Anna Rossi/ })
    )

    await user.click(
      screen.getByRole("button", { name: "Crea/assegna contatti" })
    )

    expect(await screen.findByText("Contatti assegnati")).toBeTruthy()
    const calls = backend.state.handled
    expect(calls.flatMap((call) => call.customerIds).sort()).toEqual([
      "c-1",
      "c-2",
      "c-3",
    ])
    for (const call of calls) {
      expect(call).toMatchObject({ operatorId: 1, state: "chiamare" })
      // Each call resolves only the alerts of its own customers
      expect(
        call.resolveAlertCustomerIds?.every((id) =>
          call.customerIds.includes(id)
        )
      ).toBe(true)
    }
    expect(calls.flatMap((call) => call.resolveAlertCustomerIds ?? [])).toEqual(
      ["c-1"]
    )
    expect(backend.state.assigned).toEqual([])
    expect(screen.getByText("Alert risolti").nextSibling?.textContent).toBe("1")
    expect(screen.getByText("Alert mantenuti").nextSibling?.textContent).toBe(
      "1"
    )
  })

  it("'Assegna Clienti' sposta i clienti senza creare contatti", async () => {
    const backend = backendFor()
    const user = await setup(backend)
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Mario Rossi")
    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    expect(await screen.findByText("Clienti assegnati")).toBeTruthy()
    expect(
      backend.state.assigned.flatMap((call) => call.customerIds).sort()
    ).toEqual(["c-1", "c-2", "c-3"])
    expect(backend.state.assigned.every((call) => call.operatorId === 2)).toBe(
      true
    )
    expect(backend.state.handled).toEqual([])
  })

  it("se il backend rifiuta mostra il motivo e torna al modulo", async () => {
    const backend = backendFor()
    backend.state.failingBulk = true
    const user = await setup(backend)
    await choose(user, "Assegna Clienti")
    await pickOperator(user, "Mario Rossi")

    await user.click(screen.getByRole("button", { name: "Assegna clienti" }))

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Assegna clienti" })
      ).toBeTruthy()
    )
    expect(screen.queryByText("Clienti assegnati")).toBeNull()
  })
})
