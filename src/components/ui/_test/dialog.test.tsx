import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../dialog"

// The close X comes first in the tab order, the initial focus does not move

const setup = () => {
  const user = userEvent.setup()
  render(
    <Dialog>
      <DialogTrigger>Apri</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Titolo</DialogTitle>
        {/* What Radix adds inside a form next to a Select or a Checkbox */}
        <select aria-hidden tabIndex={-1} />
        <input aria-label="Nome" />
        <button>Conferma</button>
      </DialogContent>
    </Dialog>
  )
  return user
}

describe("DialogContent", () => {
  it("all'apertura il focus va al primo controllo, non alla X né ai campi nascosti", async () => {
    const user = setup()

    await user.click(screen.getByRole("button", { name: "Apri" }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Nome" })
      )
    )
  })

  it("la X si chiama Chiudi e viene prima del contenuto nell'ordine del Tab", async () => {
    const user = setup()
    await user.click(screen.getByRole("button", { name: "Apri" }))
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Nome" })
      )
    )

    await user.tab({ shift: true })

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Chiudi" })
    )
  })

  it("con la sola X il focus va alla X", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Caricamento</DialogTitle>
          <p>Attendere...</p>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Apri" }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Chiudi" })
      )
    )
  })

  it("se il primo controllo è un campo di testo ne seleziona il contenuto", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Titolo</DialogTitle>
          <input aria-label="Nome" defaultValue="Mario" />
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Apri" }))

    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Nome",
    })
    await waitFor(() => expect(document.activeElement).toBe(input))
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5])
  })
})
