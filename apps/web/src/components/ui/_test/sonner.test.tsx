import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { shownToasts } from "@/test/toast"
import { Toaster } from "../sonner"

// The Toaster of the app on Sonner (T1 of brain/specs/crm/toast-sonner):
// what it sets once for every toast. Sonner's own behaviour (Esc, the pause,
// the stack on hover) is checked in the browser (T10)

/** Lets Sonner's timers run: it adds a toast with a `setTimeout(0)` */
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

afterEach(() => {
  vi.useRealTimers()
})

describe("Toaster", () => {
  it("mostra il toast nella regione «Notifiche (F8)», con «Chiudi notifica» (AC18, AC32)", async () => {
    render(<Toaster />)

    act(() => {
      toast.success("Salvato")
    })

    const region = screen.getByRole("region", { name: "Notifiche (F8)" })
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(await within(region).findByText("Salvato")).toBeInTheDocument()
    expect(
      within(region).getByRole("button", { name: "Chiudi notifica" })
    ).toBeInTheDocument()
  })

  it("porta il focus nella lista con F8 (AC31)", async () => {
    const user = userEvent.setup()
    render(<Toaster />)
    act(() => {
      toast("Salvato")
    })
    await screen.findByText("Salvato")

    await user.keyboard("[F8]")

    const list = document.querySelector("[data-sonner-toaster]")
    expect(list).not.toBeNull()
    expect(list).toHaveFocus()
  })

  it("dà l'icona ai tipi successo, errore e informativo, non al neutro (AC5)", async () => {
    render(<Toaster />)
    act(() => {
      toast("Neutro")
      toast.success("Successo")
      toast.error("Errore")
      toast.info("Informativo")
    })

    const toastOf = async (text: string) =>
      (await screen.findByText(text)).closest("[data-sonner-toast]")
    expect((await toastOf("Neutro"))?.querySelector("[data-icon]")).toBeNull()
    for (const [text, type] of [
      ["Successo", "success"],
      ["Errore", "error"],
      ["Informativo", "info"],
    ] as const) {
      const node = await toastOf(text)
      expect(node).toHaveAttribute("data-type", type)
      expect(node?.querySelector("[data-icon]")).not.toBeNull()
    }
  })

  it("chiude un toast senza durata dopo 5 s, e uno da 1 s dopo 1 s (AC13, AC14)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    render(<Toaster />)
    act(() => {
      toast("Cinque secondi")
      toast("Un secondo", { duration: 1000 })
    })
    await wait(0)
    expect(shownToasts()).toHaveLength(2)

    await wait(900)
    expect(screen.getByText("Un secondo")).toBeInTheDocument()
    // The exit lasts 200 ms, then the toast leaves the document
    await wait(100 + 250)
    expect(screen.queryByText("Un secondo")).toBeNull()
    expect(screen.getByText("Cinque secondi")).toBeInTheDocument()

    await wait(3500)
    expect(screen.getByText("Cinque secondi")).toBeInTheDocument()
    await wait(500 + 250)
    expect(screen.queryByText("Cinque secondi")).toBeNull()
  })

  it("lascia nella pila il toast precedente, e dal quarto nasconde i più vecchi (AC11, AC12)", async () => {
    render(<Toaster />)
    act(() => {
      toast("Primo")
      toast("Secondo")
    })
    expect(await screen.findByText("Secondo")).toBeInTheDocument()
    expect(screen.getByText("Primo")).toBeInTheDocument()

    act(() => {
      toast("Terzo")
      toast("Quarto")
    })
    await screen.findByText("Quarto")
    const first = screen.getByText("Primo").closest("[data-sonner-toast]")
    expect(first).toHaveAttribute("data-visible", "false")
    expect(
      screen.getByText("Quarto").closest("[data-sonner-toast]")
    ).toHaveAttribute("data-visible", "true")
  })
})
