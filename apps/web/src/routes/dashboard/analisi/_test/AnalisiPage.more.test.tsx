import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, onTestFinished } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

describe("the indicators, more (AC2, AC36)", () => {
  /**
   * `window.matchMedia` of a screen with the indicators in a column or in a
   * strip, until the test ends. Only the query of Tailwind's `xl`, which lays
   * them out, says column: in rem, as the CSS, so a browser with a larger
   * default font gets keys and layout from the same breakpoint (AC36, AC38)
   */
  const stubScreen = (column: boolean) => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- put back as it was, never called apart
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: column && query === "(min-width: 80rem)",
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia
    onTestFinished(() => {
      window.matchMedia = original
    })
  }

  it("in the column, ↑/↓ move and wrap around, and ←/→ are left alone (AC36)", async () => {
    stubScreen(true)
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=financed", fakeAnalisi(), {
      role: "ADMIN",
    })
    const first = await screen.findByRole("tab", { name: /Finanziato totale/ })
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "vertical"
    )
    first.focus()

    await user.keyboard("{ArrowUp}")
    const last = screen.getByRole("tab", { name: /Tasso di appuntamento/ })
    expect(last).toHaveAttribute("aria-selected", "true")
    expect(last).toHaveFocus()

    await user.keyboard("{ArrowDown}")
    expect(first).toHaveAttribute("aria-selected", "true")
    expect(first).toHaveFocus()

    // The arrows of the other axis are not the tablist's: nothing moves
    await user.keyboard("{ArrowRight}{ArrowLeft}")
    expect(first).toHaveAttribute("aria-selected", "true")
    expect(first).toHaveFocus()
  })

  it("in the strip, ←/→ move and wrap around, ↑/↓ are left alone, Home and End jump (AC36)", async () => {
    stubScreen(false)
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=financed", fakeAnalisi(), {
      role: "ADMIN",
    })
    const first = await screen.findByRole("tab", { name: /Finanziato totale/ })
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-orientation",
      "horizontal"
    )
    first.focus()

    await user.keyboard("{ArrowLeft}")
    const last = screen.getByRole("tab", { name: /Tasso di appuntamento/ })
    expect(last).toHaveAttribute("aria-selected", "true")
    expect(last).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(first).toHaveAttribute("aria-selected", "true")
    expect(first).toHaveFocus()

    // Up and down are not the tablist's here, and the page keeps its default
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    })
    first.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    // Nor an arrow with a modifier: Alt+← is the browser's Back
    const back = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    first.dispatchEvent(back)
    expect(back.defaultPrevented).toBe(false)
    expect(first).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{ArrowUp}{ArrowDown}")
    expect(first).toHaveAttribute("aria-selected", "true")

    await user.keyboard("{End}")
    expect(last).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{Home}")
    expect(first).toHaveAttribute("aria-selected", "true")
  })

  it("keep only the selected tab in the Tab order, and point it at the panel", async () => {
    renderAnalisi("/dashboard/analisi?chart=average", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato medio per pratica",
    })
    const tabs = within(
      screen.getByRole("tablist", { name: "Indicatori" })
    ).getAllByRole("tab")

    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1])
    expect(tabs[1]).toHaveAttribute("aria-controls", panel.id)
  })

  it("announce the chart chosen", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    await user.click(
      await screen.findByRole("tab", { name: /Finanziato per sede/ })
    )

    expect(
      screen.getByText("Finanziato per sede, grafico selezionato")
    ).toHaveAttribute("aria-live", "polite")
  })

  it("show the number with its unit, and «Adesso» on the queue", async () => {
    renderAnalisi("/dashboard/analisi", fakeAnalisi(), { role: "ADMIN" })

    const branches = await screen.findByRole("tab", {
      name: /Finanziato per sede/,
    })
    await waitFor(() => expect(branches).toHaveTextContent("9 sedi"))
    const progress = screen.getByRole("tab", { name: /Contatti con esito/ })
    await waitFor(() => expect(progress).toHaveTextContent("Adesso"))
  })
})
