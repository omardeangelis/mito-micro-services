import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { fakeAnalisi } from "@/test/analisi"
import { renderAnalisi } from "./page"

// The totals of «Risposte per operatore» (spec andamenti-chiamate, AC13, AC15, AC17)

const panelOf = (title: string) =>
  screen.findByRole("tabpanel", { name: title })

describe("«Risposte per operatore» totals", () => {
  it("shows the four totals and ends the table with «Totale» for the ADMIN (AC13, AC15)", async () => {
    renderAnalisi("/dashboard/analisi?chart=calls", fakeAnalisi(), {
      role: "ADMIN",
    })
    const panel = await panelOf("Risposte per operatore")

    const totals = await within(panel)
      .findByRole("group", {
        name: "Totali della finestra",
      })
      .catch(() => within(panel).findByLabelText("Totali della finestra"))
    // Default rows: 350 calls, 229 answered, 121 not, 54 appointments
    expect(totals).toHaveTextContent(/Chiamate\s*350/)
    expect(totals).toHaveTextContent(/Risposte\s*229/)
    expect(totals).toHaveTextContent(/Non risposte\s*121/)
    expect(totals).toHaveTextContent(/Appuntamenti\s*54/)

    const region = await within(panel).findByRole("region", {
      name: "Dati del grafico",
    })
    await waitFor(() =>
      expect(within(region).getAllByRole("row")).toHaveLength(5)
    )
    const last = within(region).getAllByRole("row").at(-1)!
    expect(
      within(last)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
    ).toEqual(["Totale", "350", "229", "121", "54", "65,4%"])
  })

  it("has no totals and no «Totale» for the OPERATORE (AC17)", async () => {
    renderAnalisi("/dashboard/analisi?chart=calls", fakeAnalisi(), {
      role: "OPERATORE",
    })
    const panel = await panelOf("Risposte per operatore")

    await within(panel).findByRole("region", { name: "Dati del grafico" })
    expect(within(panel).queryByText("Totale")).not.toBeInTheDocument()
    expect(
      within(panel).queryByLabelText("Totali della finestra")
    ).not.toBeInTheDocument()
  })
})
