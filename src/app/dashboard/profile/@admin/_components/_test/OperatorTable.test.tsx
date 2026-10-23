import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type OperatorWithRole } from "@mito/domain/schemas"
import { useOperatorTableStore } from "../../_store/useOperatorTableStore"
import { OperatorTable } from "../OperatorTable"

// Azione "Disattiva" per riga (AC21) e errori del cambio ruolo (AC20a)

const mocks = vi.hoisted(() => ({
  updateRole: vi.fn(),
  deactivate: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/trpc/react", () => ({
  api: {
    operator: {
      getDeactivationImpact: {
        useQuery: () => ({
          data: { customers: 0, contacts: 0, practices: 0 },
          isLoading: false,
          isError: false,
        }),
      },
      getOperatorsForDeactivation: {
        useQuery: () => ({
          data: [{ id: 3, name: "Carla", surname: "Test" }],
          isLoading: false,
          isError: false,
        }),
      },
    },
  },
}))

vi.mock("../../_actions/deactivateOperator", () => ({
  deactivateOperatorAction: mocks.deactivate,
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
  mocks.deactivate.mockReset()
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
    expect(screen.getByRole("button", { name: "Salva" })).toHaveProperty(
      "disabled",
      false
    )
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

  it("se la chiamata del cambio ruolo viene rifiutata mostra l'errore e Salva torna attivo", async () => {
    mocks.updateRole.mockRejectedValue(new Error("Failed to fetch"))
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={3} />)

    await changeRoleAndSave(user)

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Errore durante l'aggiornamento dei ruoli",
          variant: "destructive",
        })
      )
    )
    expect(screen.getByRole("button", { name: "Salva" })).toHaveProperty(
      "disabled",
      false
    )
  })

  const deactivateBruno = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      screen.getByRole("button", { name: "Disattiva Bruno Test" })
    )
    await screen.findByRole("dialog")
    await user.click(screen.getByRole("combobox", { name: "Passa a" }))
    await user.click(await screen.findByRole("option", { name: "Carla Test" }))
    await user.click(screen.getByRole("button", { name: "Conferma" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  }

  it("disattivare un operatore toglie la sua modifica di ruolo in sospeso", async () => {
    mocks.deactivate.mockResolvedValue({
      result: { customersMoved: 0, contactsMoved: 0, practicesMoved: 0 },
    })
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={1} />)
    // Row of Bruno: OPERATORE -> ADMIN, not saved
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    await deactivateBruno(user)

    expect(useOperatorTableStore.getState().operatorsToEdit).toEqual([])
    expect(screen.getByRole("button", { name: "Salva" })).toHaveProperty(
      "disabled",
      true
    )
  })

  it("dopo una disattivazione il focus va al titolo della tabella", async () => {
    mocks.deactivate.mockResolvedValue({
      result: { customersMoved: 0, contactsMoved: 0, practicesMoved: 0 },
    })
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={1} />)

    await deactivateBruno(user)

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Gestisci operatori" })
      )
    )
  })

  it("quando una riga sparisce la modifica in sospeso non passa alla riga dopo", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <OperatorTable data={data} currentOperatorId={1} />
    )
    // Row of Bruno: OPERATORE -> ADMIN, not saved
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    // Bruno deactivated: the page comes back without his row
    rerender(
      <OperatorTable data={[data[0]!, data[2]!]} currentOperatorId={1} />
    )

    // The row of Carla shows her role, not Bruno's pending one
    expect(screen.getAllByRole("combobox")[1]!.textContent).toBe("operatore")
  })

  it("disattivare un operatore lascia le modifiche in sospeso degli altri", async () => {
    mocks.deactivate.mockResolvedValue({
      result: { customersMoved: 0, contactsMoved: 0, practicesMoved: 0 },
    })
    const user = userEvent.setup()
    render(<OperatorTable data={data} currentOperatorId={1} />)
    // Carla and Bruno: OPERATORE -> ADMIN, not saved
    await user.click(screen.getAllByRole("combobox")[2]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    await deactivateBruno(user)

    expect(useOperatorTableStore.getState().operatorsToEdit).toEqual([
      { id: 3, role: "ADMIN" },
    ])
  })

  it("Salva non manda le modifiche delle righe sparite per altre vie", async () => {
    mocks.updateRole.mockResolvedValue({})
    const user = userEvent.setup()
    const { rerender } = render(
      <OperatorTable data={data} currentOperatorId={1} />
    )
    // Bruno and Carla: OPERATORE -> ADMIN, not saved
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))
    await user.click(screen.getAllByRole("combobox")[2]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    // Another admin deactivated Bruno: the page comes back without his row
    rerender(
      <OperatorTable data={[data[0]!, data[2]!]} currentOperatorId={1} />
    )
    await user.click(screen.getByRole("button", { name: "Salva" }))

    await waitFor(() => expect(mocks.updateRole).toHaveBeenCalledTimes(1))
    expect(mocks.updateRole).toHaveBeenCalledWith([{ id: 3, role: "ADMIN" }])
  })

  it("con la sola modifica di una riga sparita Salva resta spento", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <OperatorTable data={data} currentOperatorId={1} />
    )
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(await screen.findByRole("option", { name: "Admin" }))

    rerender(
      <OperatorTable data={[data[0]!, data[2]!]} currentOperatorId={1} />
    )

    expect(screen.getByRole("button", { name: "Salva" })).toHaveProperty(
      "disabled",
      true
    )
  })
})
