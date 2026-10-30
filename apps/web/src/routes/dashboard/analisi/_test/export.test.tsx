import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

describe("«Dati del grafico» (AC2, AC29, AC35)", () => {
  it("«Copia» puts the header rows, the column names and the rows in the clipboard", async () => {
    const user = userEvent.setup()
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await screen.findByRole("tabpanel", {
      name: "Finanziato per sede",
    })
    const copy = await within(panel).findByRole("button", { name: /Copia/ })
    await waitFor(() => expect(copy).toBeEnabled())

    await user.click(copy)

    const copied = await navigator.clipboard.readText()
    expect(copied.startsWith("Grafico\tFinanziato per sede")).toBe(true)
    expect(copied).toContain("Sede\tPratiche\tFinanziato (€)\tQuota (%)")
    expect(await screen.findByText("Tabella copiata")).toBeInTheDocument()
  })

  it("the table is a region named «Dati del grafico», reachable with Tab", async () => {
    renderAnalisi("/dashboard/analisi?chart=branches", fakeAnalisi(), {
      role: "ADMIN",
    })

    const region = await screen.findByRole("region", {
      name: "Dati del grafico",
    })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(within(region).getByRole("table")).toBeInTheDocument()
    expect(within(region).getAllByRole("row")).toHaveLength(10)
  })
})
