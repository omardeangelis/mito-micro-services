import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Toaster } from "@/components/ui/sonner"
import { DropDownCilpBoard, TableActionMenu } from "../TableActions"

// «Copiato con successo» of the rows' menu (AC21): no close button, a «Chiudi»
// that Sonner itself closes the toast with

describe("DropDownCilpBoard", () => {
  it("il toast ha «Chiudi» e non «Chiudi notifica»; premerlo lo chiude (AC21)", async () => {
    const user = userEvent.setup()
    render(
      <>
        <TableActionMenu>
          <DropDownCilpBoard label="Copia ID" value="42" />
        </TableActionMenu>
        <Toaster />
      </>
    )

    await user.click(screen.getByRole("button", { name: "Open menu" }))
    await user.click(screen.getByRole("menuitem", { name: "Copia ID" }))

    const copied = await screen.findByText("Copiato con successo")
    const node = copied.closest("[data-sonner-toast]")
    expect(node).toHaveAttribute("data-type", "success")
    expect(screen.queryByRole("button", { name: "Chiudi notifica" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Chiudi" }))

    await vi.waitFor(() => {
      expect(screen.queryByText("Copiato con successo")).toBeNull()
    })
  })
})
