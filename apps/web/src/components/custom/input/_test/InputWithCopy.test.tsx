import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Toaster } from "@/components/ui/sonner"
import { InputWithCopy } from "../InputWithCopy"

// The copy of a field: its toast has the close button like the others (AC18)

describe("InputWithCopy", () => {
  it("«Copiato con successo» ha «Chiudi notifica» (AC18)", async () => {
    const user = userEvent.setup()
    render(
      <>
        <InputWithCopy canCopy value="RSSMRA80A01H501U" readOnly />
        <Toaster />
      </>
    )

    await user.click(
      screen.getByRole("button", { name: "Toggle password visibility" })
    )

    const copied = await screen.findByText("Copiato con successo")
    expect(copied.closest("[data-sonner-toast]")).toHaveAttribute(
      "data-type",
      "success"
    )
    expect(
      screen.getByRole("button", { name: "Chiudi notifica" })
    ).toBeInTheDocument()
  })
})
