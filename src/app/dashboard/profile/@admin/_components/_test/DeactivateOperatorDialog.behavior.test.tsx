import { createRef } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DeactivateOperatorDialog } from "../DeactivateOperatorDialog"

// Errori, successo e tastiera del dialog "Disattiva" (AC21–AC23)

type Query<T> = {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

const loaded = <T,>(data: T): Query<T> => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
})

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  toast: vi.fn(),
  onDeactivated: vi.fn(),
  impact: undefined as unknown,
  targets: undefined as unknown,
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getDeactivationImpact: { useQuery: () => mocks.impact },
      getOperatorsForDeactivation: { useQuery: () => mocks.targets },
    },
  },
}))

vi.mock("../../_actions/deactivateOperator", () => ({
  deactivateOperatorAction: mocks.action,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

beforeEach(() => {
  mocks.action.mockReset()
  mocks.toast.mockReset()
  mocks.onDeactivated.mockReset()
  mocks.impact = loaded({ customers: 3, contacts: 2, practices: 1 })
  mocks.targets = loaded([{ id: 2, name: "Luca", surname: "Bianchi" }])
})

const heading = createRef<HTMLHeadingElement>()

const dialog = () => (
  <>
    <h1 ref={heading} tabIndex={-1}>
      Gestisci operatori
    </h1>
    <DeactivateOperatorDialog
      operator={{ id: 1, name: "Mario", surname: "Rossi" }}
      onDeactivated={mocks.onDeactivated}
      returnFocusTo={heading}
    />
  </>
)

const setup = () => {
  const user = userEvent.setup()
  const { rerender } = render(dialog())
  return Object.assign(user, { rerender: () => rerender(dialog()) })
}

const rowButton = () =>
  screen.getByRole("button", { name: "Disattiva Mario Rossi" })

const openAndPick = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(rowButton())
  await screen.findByRole("dialog", { name: "Disattiva Mario Rossi" })
  await user.click(screen.getByRole("combobox"))
  await user.click(await screen.findByRole("option", { name: "Luca Bianchi" }))
}

describe("DeactivateOperatorDialog", () => {
  it("mostra quanti clienti, contatti attivi e pratiche passeranno", async () => {
    const user = setup()
    await user.click(rowButton())

    expect(await screen.findByText("3 clienti")).toBeTruthy()
    expect(screen.getByText("2 contatti attivi")).toBeTruthy()
    expect(screen.getByText("1 pratica")).toBeTruthy()
  })

  it.each([
    ["OPERATOR_IS_ADMIN", "Declassa l'admin a operatore prima di disattivarlo"],
    ["CANNOT_DEACTIVATE_SELF", "Non puoi disattivare te stesso"],
    ["OPERATOR_NOT_FOUND", "Operatore non valido"],
    ["HANDOVER_SAME_OPERATOR", "Il cliente è già assegnato a questo operatore"],
    ["OPERATOR_DISABLED", "Utente disattivato"],
    ["UNKNOWN", "Modifica non salvata, riprova"],
  ])(
    "con %s mostra il messaggio e il dialog resta aperto",
    async (code, message) => {
      mocks.action.mockResolvedValue({ error: code })
      const user = setup()
      await openAndPick(user)

      await user.click(screen.getByRole("button", { name: "Conferma" }))

      expect((await screen.findByRole("alert")).textContent).toBe(message)
      expect(screen.getByRole("dialog")).toBeTruthy()
      expect(mocks.action).toHaveBeenCalledWith({
        operatorId: 1,
        toOperatorId: 2,
      })
      expect(mocks.toast).not.toHaveBeenCalled()
      expect(mocks.onDeactivated).not.toHaveBeenCalled()
    }
  )

  it("dopo la conferma chiude il dialog e mostra i conteggi", async () => {
    mocks.action.mockResolvedValue({
      result: { customersMoved: 3, contactsMoved: 2, practicesMoved: 1 },
    })
    const user = setup()
    await openAndPick(user)

    await user.click(screen.getByRole("button", { name: "Conferma" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(mocks.onDeactivated).toHaveBeenCalledWith(1)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title:
          "Operatore disattivato: 3 clienti, 2 contatti, 1 pratica passati a Luca Bianchi",
      })
    )
  })

  it("se la chiamata viene rifiutata mostra l'errore e il dialog si chiude con Esc", async () => {
    mocks.action.mockRejectedValue(new Error("Failed to fetch"))
    const user = setup()
    await openAndPick(user)

    await user.click(screen.getByRole("button", { name: "Conferma" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Modifica non salvata, riprova"
    )
    expect(screen.getByRole("button", { name: "Conferma" })).toHaveProperty(
      "disabled",
      false
    )
    expect(mocks.onDeactivated).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("se la destinazione scelta non è più nella lista lo dice e la toglie", async () => {
    const user = setup()
    await openAndPick(user)
    // A refetch while the dialog is open: Luca is no longer a destination
    mocks.targets = loaded([{ id: 3, name: "Sara", surname: "Verdi" }])
    user.rerender()

    await user.click(screen.getByRole("button", { name: "Conferma" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "L'operatore scelto non è più disponibile: scegline un altro"
    )
    expect(mocks.action).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Conferma" })).toHaveProperty(
      "disabled",
      true
    )
  })

  it("se i dati non arrivano lo dice e Riprova li richiede", async () => {
    const impact = loaded(undefined)
    mocks.impact = { ...impact, isError: true }
    const user = setup()
    await user.click(rowButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Impossibile caricare i dati dell'operatore"
    )
    expect(screen.queryByText("Caricamento...")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Riprova" }))
    expect(impact.refetch).toHaveBeenCalled()
  })

  it("dopo la conferma il focus va dove dice la tabella", async () => {
    mocks.action.mockResolvedValue({
      result: { customersMoved: 0, contactsMoved: 0, practicesMoved: 0 },
    })
    const user = setup()
    await openAndPick(user)

    await user.click(screen.getByRole("button", { name: "Conferma" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(heading.current))
  })

  it("all'apertura il focus è sul select della destinazione", async () => {
    const user = setup()
    await user.click(rowButton())

    await screen.findByRole("dialog")
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("combobox"))
    )
  })

  it("Esc chiude il dialog e il focus torna al bottone della riga", async () => {
    const user = setup()
    await user.click(rowButton())
    await screen.findByRole("dialog")

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(rowButton())
  })

  it("scegliere un'altra destinazione toglie il messaggio d'errore", async () => {
    const user = setup()
    await openAndPick(user)
    mocks.targets = loaded([{ id: 3, name: "Sara", surname: "Verdi" }])
    user.rerender()
    await user.click(screen.getByRole("button", { name: "Conferma" }))
    await screen.findByRole("alert")

    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Sara Verdi" }))

    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("dopo una disattivazione riuscita, la volta dopo Esc riporta il focus al bottone della riga", async () => {
    mocks.action.mockResolvedValue({
      result: { customersMoved: 0, contactsMoved: 0, practicesMoved: 0 },
    })
    const user = setup()
    await openAndPick(user)
    await user.click(screen.getByRole("button", { name: "Conferma" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(heading.current))

    // Same instance: the row is still mounted
    await user.click(rowButton())
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(rowButton()))
  })
})
