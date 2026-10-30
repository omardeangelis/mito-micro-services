import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DataTable } from "../_components/DataTable"
import { type Table } from "../_lib/results"

const table: Table = {
  columns: [
    { header: "Periodo", format: "text" },
    { header: "Chiamate", format: "count" },
    { header: "Non risposte", format: "count" },
    { header: "Appuntamenti", format: "count" },
    { header: "Risposta (%)", format: "percent" },
    { header: "Chiamate confronto", format: "count" },
  ],
  rows: [["1 ott", 1196, 1100, 96, 94, 1050]],
}

// jsdom measures nothing, so the width of the table at 125% of text (AC38) is
// measured in a browser; what a unit test can keep is what lets it fit: a
// header that may wrap and cells of numbers that never do
describe("the table under a chart (AC38)", () => {
  it("lets every header wrap, even inside a word, so the columns follow the numbers", () => {
    render(<DataTable table={table} />)

    for (const column of table.columns) {
      const header = screen.getByRole("columnheader", { name: column.header })
      expect(header).toHaveClass("whitespace-normal")
      expect(header).not.toHaveClass("whitespace-nowrap")
      expect(header).toHaveClass("[overflow-wrap:anywhere]")
    }
  })

  it("keeps a number on one line, in tabular figures, and the text free to wrap", () => {
    render(<DataTable table={table} />)

    const cells = screen.getAllByRole("cell")
    expect(cells[0]).toHaveClass("whitespace-normal")
    for (const cell of cells.slice(1)) {
      expect(cell).toHaveClass("whitespace-nowrap", "tabular-nums")
    }
  })
})
