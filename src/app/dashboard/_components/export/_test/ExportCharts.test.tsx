import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OperatorCalls } from "@mito/domain/export/calls"
import { answeredSeries, ExportCharts } from "../ExportCharts"

// Recharts needs a measured container, which jsdom doesn't have
vi.mock("@tremor/react", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  BarChart: () => null,
}))

const row = (
  surname: string,
  values: Partial<OperatorCalls>
): OperatorCalls => ({
  operatorId: surname.length,
  name: "Anna",
  surname,
  calls: 0,
  answered: 0,
  appointments: 0,
  noAnswer: 0,
  ...values,
})

describe("answeredSeries", () => {
  it("stacks answered and not answered for each operator (AC17)", () => {
    expect(
      answeredSeries([row("Rossi", { answered: 3, noAnswer: 2, calls: 5 })])
    ).toEqual([{ Operatore: "Rossi Anna", Risposte: 3, "Non risposte": 2 }])
  })
})

describe("ExportCharts", () => {
  it("ranks by appointment rate, with 0% for who had no answer (AC18)", () => {
    render(
      <ExportCharts
        rows={[
          row("Neri", { calls: 3, noAnswer: 3 }),
          row("Bianchi", { calls: 4, answered: 4, appointments: 1 }),
          row("Rossi", { calls: 2, answered: 2, appointments: 1 }),
        ]}
      />
    )
    const items = within(
      screen.getByRole("list", { name: "Classifica appuntamenti" })
    )
      .getAllByRole("listitem")
      .map((item) => item.textContent?.replace(/\s+/g, " "))
    expect(items).toEqual(["Rossi Anna50%", "Bianchi Anna25%", "Neri Anna0%"])
  })
})
