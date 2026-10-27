import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { focusIsLost } from "../focus"

// The customer sheet opens in a Sheet, as `CustomerSheet` does
function SheetWith({ showButton }: { showButton: boolean }) {
  return (
    <Sheet open>
      <SheetContent>
        <SheetTitle>Scheda Cliente</SheetTitle>
        {showButton && <button type="button">Crea contatto</button>}
        <button type="button">Salva</button>
      </SheetContent>
    </Sheet>
  )
}

describe("focusIsLost", () => {
  it("è vero con il focus su body", () => {
    render(<button type="button">Altro</button>)
    expect(focusIsLost()).toBe(true)
  })

  it("è falso con il focus su un controllo", () => {
    render(<button type="button">Altro</button>)
    screen.getByRole("button", { name: "Altro" }).focus()
    expect(focusIsLost()).toBe(false)
  })

  it("è vero quando il controllo con il focus sparisce dentro una Sheet", async () => {
    const { rerender } = render(<SheetWith showButton />)
    screen.getByRole("button", { name: "Crea contatto" }).focus()

    rerender(<SheetWith showButton={false} />)

    // Radix moves the focus to the Sheet itself, not to body
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("dialog"))
    )
    expect(focusIsLost()).toBe(true)
  })

  it("è falso con il focus su un controllo dentro una Sheet", () => {
    render(<SheetWith showButton />)
    screen.getByRole("button", { name: "Salva" }).focus()
    expect(focusIsLost()).toBe(false)
  })
})
