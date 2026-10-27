import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef } from "react"
import { Tabs } from "radix-ui"
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

  it("se il primo controllo passa il focus a un figlio, il focus resta lì", async () => {
    // Like a Radix Tabs.List, which moves the focus to the active tab
    const Delegating = () => {
      const inner = useRef<HTMLButtonElement>(null)
      return (
        <div tabIndex={0} onFocus={() => inner.current?.focus()}>
          <button tabIndex={-1} ref={inner}>
            Interno
          </button>
        </div>
      )
    }
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Titolo</DialogTitle>
          <Delegating />
          <button>Dopo</button>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Apri" }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Interno" })
      )
    )
  })

  it("con i tab come primo controllo il focus va al tab attivo", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Esporta</DialogTitle>
          <Tabs.Root defaultValue="default">
            <Tabs.List>
              <Tabs.Trigger value="default">Standard</Tabs.Trigger>
              <Tabs.Trigger value="calls">Chiamate</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
          <button>Periodo</button>
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Apri" }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "Standard" })
      )
    )
  })

  it("salta i link, come Radix", async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger>Apri</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Titolo</DialogTitle>
          <a href="#guida">Guida</a>
          <input aria-label="Nome" />
        </DialogContent>
      </Dialog>
    )

    await user.click(screen.getByRole("button", { name: "Apri" }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Nome" })
      )
    )
  })
})
