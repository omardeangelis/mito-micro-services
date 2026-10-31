import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { describe, expect, it, vi } from "vitest"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../dialog"
import { sleep } from "@/test/toast"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../sheet"
import { Toaster } from "../sonner"

// A toast pressed while a Sheet or a Dialog is open (AC34, AC35, T2 of
// brain/specs/crm/toast-sonner): the toasts are outside the overlay, which
// would read the press as a click outside and close. jsdom checks only that
// half: the `pointer-events: none` Radix puts on the body is checked in the
// browser (T10), hence `pointerEventsCheck: 0`. The open overlay hides the
// rest of the page from the accessibility tree, so the toasts' roles are
// queried with `hidden`

type Overlay = "Sheet" | "Dialog"

/** The overlay, open, with a field, and an outside area to click */
function Open({ overlay }: { overlay: Overlay }) {
  const [open, setOpen] = useState(true)
  const field = <input aria-label="Nota" />
  const content: Record<Overlay, ReactNode> = {
    Sheet: (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Contatto</SheetTitle>
          <SheetDescription>Dettaglio</SheetDescription>
          {field}
        </SheetContent>
      </Sheet>
    ),
    Dialog: (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Contatto</DialogTitle>
          <DialogDescription>Dettaglio</DialogDescription>
          {field}
        </DialogContent>
      </Dialog>
    ),
  }
  return (
    <>
      <p>Fuori</p>
      {content[overlay]}
      <Toaster />
    </>
  )
}

const setup = async (overlay: Overlay) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(<Open overlay={overlay} />)
  await user.type(screen.getByRole("textbox", { name: "Nota" }), "abc")
  return user
}

describe.each<Overlay>(["Sheet", "Dialog"])(
  "toast con una %s aperta",
  (overlay) => {
    it("la X chiude solo il toast; la finestra resta aperta col suo stato (AC34)", async () => {
      const user = await setup(overlay)
      act(() => {
        toast.success("Salvato")
      })
      await screen.findByText("Salvato")

      await user.click(
        screen.getByRole("button", { name: "Chiudi notifica", hidden: true })
      )

      expect(
        screen.getByRole("dialog", { name: "Contatto" })
      ).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: "Nota" })).toHaveValue("abc")
      await vi.waitFor(() => {
        expect(screen.queryByText("Salvato")).toBeNull()
      })
    })

    it("il collegamento naviga prima che la finestra si chiuda (AC35)", async () => {
      const user = await setup(overlay)
      const openAtNavigation: boolean[] = []
      const navigate = vi.fn(() => {
        openAtNavigation.push(
          screen.queryByRole("dialog", { name: "Contatto" }) !== null
        )
      })
      act(() => {
        toast.error("", {
          description: "Contatto superato",
          action: (
            <a
              href="/dashboard/contatti/9"
              data-button=""
              onClick={navigateOnPlainClick(navigate, "/dashboard/contatti/9")}
            >
              Vai al contatto attivo
            </a>
          ),
        })
      })

      await user.click(
        await screen.findByRole("link", {
          name: "Vai al contatto attivo",
          hidden: true,
        })
      )

      expect(navigate).toHaveBeenCalledWith("/dashboard/contatti/9")
      expect(openAtNavigation).toEqual([true])
      // Nothing navigated here: the press alone leaves the overlay open
      await sleep(250)
      expect(
        screen.getByRole("dialog", { name: "Contatto" })
      ).toBeInTheDocument()
    })

    it("un clic fuori dai toast e dalla finestra la chiude ancora", async () => {
      const user = await setup(overlay)
      act(() => {
        toast("Salvato")
      })
      await screen.findByText("Salvato")

      await user.click(screen.getByText("Fuori"))

      await vi.waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Contatto" })).toBeNull()
      })
    })
  }
)
