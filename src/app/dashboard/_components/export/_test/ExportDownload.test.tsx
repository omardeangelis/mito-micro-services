import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import * as XLSX from "xlsx"
import type { CallStats } from "@mito/domain/export/calls"
import { ExportDownload } from "../ExportDownload"

const mocks = vi.hoisted(() => ({ writeFile: vi.fn() }))

vi.mock("xlsx", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  writeFile: mocks.writeFile,
}))

const stats: CallStats = {
  rows: [
    {
      operatorId: 1,
      name: "Anna",
      surname: "Rossi",
      calls: 4,
      answered: 3,
      appointments: 1,
      noAnswer: 1,
    },
  ],
  totals: { calls: 4, answered: 3, appointments: 1, noAnswer: 1 },
}

describe("ExportDownload", () => {
  it("saves the numbers on the page, named after the period (AC13, AC19)", async () => {
    render(
      <ExportDownload
        stats={stats}
        period={{ from: "2026-09-24", to: "2026-10-23" }}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: "Scarica Excel" }))

    await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledTimes(1))
    const [workbook, name] = mocks.writeFile.mock.calls[0] as [
      XLSX.WorkBook,
      string,
    ]
    expect(name).toBe("chiamate_2026-09-24_2026-10-23.xlsx")
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets.Chiamate!, { header: 1 })
    ).toEqual([
      [
        "Operatore",
        "Chiamate effettuate",
        "Risposte",
        "Appuntamenti fissati",
        "Non risposte",
      ],
      ["Rossi Anna", 4, 3, 1, 1],
      ["Totale", 4, 3, 1, 1],
    ])
  })
})
