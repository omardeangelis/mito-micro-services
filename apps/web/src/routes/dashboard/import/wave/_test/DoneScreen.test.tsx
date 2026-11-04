import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "@/components/ui/button"
import { DoneScreen } from "../DoneScreen"

describe("La schermata di fine (AC17)", () => {
  it("ha il titolo, il testo e i pulsanti, e porta il fuoco sul titolo", () => {
    render(
      <DoneScreen
        title="Assegnati 342 clienti della wave_ottobre"
        text="Scadenza gio 3 dic. Li trovano in Da chiamare."
        actions={<Button>Vai alla Wave</Button>}
      />
    )

    const title = screen.getByRole("heading", {
      level: 2,
      name: "Assegnati 342 clienti della wave_ottobre",
    })
    expect(title).toHaveFocus()
    expect(
      screen.getByText("Scadenza gio 3 dic. Li trovano in Da chiamare.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Vai alla Wave" })
    ).toBeInTheDocument()
  })
})
