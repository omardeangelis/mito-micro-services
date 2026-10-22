import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type OperatorWithRole } from "@mito/domain/schemas"
import { useOperatorTableStore } from "../../_store/useOperatorTableStore"
import { OperatorTable } from "../OperatorTable"

// Azione "Disattiva" per riga (AC21) e errori del cambio ruolo (AC20a)

const mocks = vi.hoisted(() => ({
  updateRole: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getDeactivationImpact: {
        useQuery: () => ({ data: undefined, isLoading: true }),
      },
      getOperatorsForDeactivation: {
        useQuery: () => ({ data: undefined, isLoading: true }),
      },
    },
  },
}))

vi.mock("../../_actions/deactivateOperator", () => ({
  deactivateOperatorAction: vi.fn(),
}))

vi.mock("../../_actions/updateOperatorsRole", () => ({
  updateOperatorsRoleAction: mocks.updateRole,
}))

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

const op = (id: number, name: string, role: "ADMIN" | "OPERATORE") =>
  ({ id, name, surname: "Test", role }) as OperatorWithRole

const data = [
  op(1, "Anna", "ADMIN"),
  op(2, "Bruno", "OPERATORE"),
  op(3, "Carla", "OPERATORE"),
]

beforeEach(() => {
  mocks.updateRole.mockReset()
  mocks.toast.mockReset()
  useOperatorTableStore.getState().clearOperatorsToEdit()
})

describe("OperatorTable", () => {
  it("mostra Disattiva solo sulle righe OPERATORE diverse dall'utente corrente", () => {
    render(<OperatorTable data={data} currentOperatorId={3} />)

    expect(
      screen.getByRole("button", { name: "Disattiva Bruno Test" })
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Disattiva Anna Test" })).toBe(
      null
    )
    expect(screen.queryByRole("button", { name: "Disattiva Carla Test" })).toBe(
      null
    )
  })

  const changeRoleAndSave = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    // Row of Anna: ADMIN -> OPERATORE
    await user.click(screen.getAllByRole("combobox")[0]!)
    await user.click(await screen.findByRole("option", { name: "Operatore" }))
    await user.click(screen.getByRole("button", { name: "Salva" }))
  }

  it("con LAST_ADMIN mostra l'errore e non il toast di successo", async () => {
    mocks.updateRole.mockResolvedValue({ error: "LAST_ADMIN" })
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={3} />)

    await changeRoleAndSave(user)

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Deve restare almeno un admin",
        variant: "destructive",
      })
    )
    // The edits stay, so the admin can retry
    expect(useOperatorTableStore.getState().operatorsToEdit).toHaveLength(1)
  })

  it("con un errore non di dominio mostra il titolo generico", async () => {
    mocks.updateRole.mockResolvedValue({ error: "INVALID_INPUT" })
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={3} />)

    await changeRoleAndSave(user)

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Errore durante l'aggiornamento dei ruoli",
        variant: "destructive",
      })
    )
  })

  it("con successo mostra Ruoli aggiornati e svuota le modifiche", async () => {
    mocks.updateRole.mockResolvedValue({})
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={3} />)

    await changeRoleAndSave(user)

    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Ruoli aggiornati",
        variant: "success",
      })
    )
    expect(useOperatorTableStore.getState().operatorsToEdit).toHaveLength(0)
  })
})
