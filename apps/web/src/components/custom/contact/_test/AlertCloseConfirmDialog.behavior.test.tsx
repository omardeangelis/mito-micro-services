import { useRef, useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AlertCloseConfirmDialog } from "../AlertCloseConfirmDialog"

const openAlert = {
  id: 1001,
  deadline: new Date("2026-10-20T12:00:00Z"),
  message: "Richiamare dopo le 18",
}

/** A state selector's trigger and the modal its change opened. */
function Harness({
  onConfirm,
  closeOnConfirm = false,
}: {
  onConfirm: (alertId: number) => void
  closeOnConfirm?: boolean
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [alert, setAlert] = useState<typeof openAlert | null>(openAlert)
  return (
    <>
      <button ref={trigger}>Stato</button>
      <AlertCloseConfirmDialog
        alert={alert}
        onConfirm={(alertId) => {
          onConfirm(alertId)
          if (closeOnConfirm) setAlert(null)
        }}
        onCancel={() => setAlert(null)}
        returnFocusRef={trigger}
      />
    </>
  )
}

const trigger = () => screen.getByRole("button", { name: "Stato" })

describe("AlertCloseConfirmDialog", () => {
  it("Esc chiude la modale senza chiamare onConfirm e il focus torna sul trigger", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.keyboard("{Escape}")

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("il clic sull'overlay chiude la modale senza chiamare onConfirm", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const dialog = screen.getByRole("dialog")
    const overlay = dialog.previousElementSibling as HTMLElement

    await user.click(overlay)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("la X chiude la modale senza chiamare onConfirm", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.click(screen.getByRole("button", { name: "Chiudi" }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("un doppio clic su 'Cambia stato' chiama onConfirm una volta, con l'id dell'alert", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.dblClick(screen.getByRole("button", { name: "Cambia stato" }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(1001)
  })

  it("dopo la conferma e la chiusura, il focus torna sul trigger", async () => {
    const user = userEvent.setup()
    render(<Harness onConfirm={vi.fn()} closeOnConfirm />)

    await user.click(screen.getByRole("button", { name: "Cambia stato" }))

    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("all'apertura il focus è su 'Annulla'", () => {
    render(<Harness onConfirm={vi.fn()} />)

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Annulla" })
    )
  })

  it("mostra la data e il messaggio dell'alert", () => {
    render(<Harness onConfirm={vi.fn()} />)

    const dialog = screen.getByRole("dialog")
    expect(dialog.textContent).toContain(
      "Cambiando lo stato, il richiamo del 20/10/2026 verrà chiuso e spostato nello Storico"
    )
    expect(dialog.textContent).toContain("Richiamare dopo le 18")
  })

  it("senza alert non è aperta", () => {
    render(
      <AlertCloseConfirmDialog
        alert={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        returnFocusRef={{ current: null }}
      />
    )

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
