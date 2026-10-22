import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DeactivateOperatorDialog } from "../DeactivateOperatorDialog"

// Errori, successo e tastiera del dialog "Disattiva" (AC21–AC23)

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getDeactivationImpact: {
        useQuery: () => ({
          data: { customers: 3, contacts: 2, practices: 1 },
          isLoading: false,
        }),
      },
      getOperatorsForDeactivation: {
        useQuery: () => ({
          data: [{ id: 2, name: "Luca", surname: "Bianchi" }],
          isLoading: false,
        }),
      },
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
})

const setup = () => {
  const user = userEvent.setup()
  render(
    <DeactivateOperatorDialog
      operator={{ id: 1, name: "Mario", surname: "Rossi" }}
    />
  )
  return user
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
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title:
          "Operatore disattivato: 3 clienti, 2 contatti, 1 pratica passati a Luca Bianchi",
      })
    )
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
})
