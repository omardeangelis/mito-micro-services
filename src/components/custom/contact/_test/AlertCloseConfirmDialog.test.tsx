import { useRef, useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AlertCloseConfirmDialog } from "../AlertCloseConfirmDialog"

const openAlert = {
  id: 1001,
  deadline: new Date("2026-10-20T22:00:00Z"),
  message: "Richiamare dopo le 18",
}

/** A state selector's trigger and the modal its change opened. */
function Harness({ onConfirm }: { onConfirm: (alertId: number) => void }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [alert, setAlert] = useState<typeof openAlert | null>(openAlert)
  return (
    <>
      <button ref={trigger}>Stato</button>
      <AlertCloseConfirmDialog
        alert={alert}
        onConfirm={onConfirm}
        onCancel={() => setAlert(null)}
        returnFocusRef={trigger}
      />
    </>
  )
}

describe("AlertCloseConfirmDialog", () => {
  it("con un alert aperto, 'Annulla' non chiama onConfirm e il focus torna sul trigger del selettore", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)

    await user.click(screen.getByRole("button", { name: "Annulla" }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Stato" })
    )
  })

  it("il messaggio lungo scorre dentro la modale senza spingere fuori i pulsanti, e si scorre da tastiera", () => {
    render(<Harness onConfirm={vi.fn()} />)

    const message = screen.getByRole("region", {
      name: "Messaggio del richiamo",
    })

    expect(message.textContent).toBe(openAlert.message)
    expect(message.getAttribute("tabindex")).toBe("0")
    expect(message.className).toContain("overflow-y-auto")
    expect(message.className).toContain("max-h-[40vh]")
    expect(message.className).toContain("min-w-0")
    expect(message.className).toContain("[overflow-wrap:anywhere]")
  })

  it("la descrizione con la data usa il colore del testo, non quello attenuato", () => {
    render(<Harness onConfirm={vi.fn()} />)

    const description = screen.getByText(/Cambiando lo stato/)

    expect(description.className).toContain("text-foreground")
  })
})
