import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { buildCallStatsWorkbook, callStatsFileName } from "../callStatsWorkbook"
import type { CallStats } from "@mito/domain/export/calls"

const stats: CallStats = {
  rows: [
    {
      operatorId: 2,
      name: "Bruno",
      surname: "Verdi",
      calls: 5,
      answered: 3,
      appointments: 1,
      noAnswer: 2,
    },
    {
      operatorId: 1,
      name: "Anna",
      surname: "Rossi",
      calls: 2,
      answered: 2,
      appointments: 2,
      noAnswer: 0,
    },
  ],
  totals: { calls: 7, answered: 5, appointments: 3, noAnswer: 2 },
}

/** The workbook written to bytes and read back, as the downloaded file. */
const readBack = (workbook: XLSX.WorkBook) =>
  XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }))

describe("buildCallStatsWorkbook", () => {
  it("writes one sheet: header, one row per operator in order, then the totals (AC13)", () => {
    const workbook = readBack(buildCallStatsWorkbook(stats))

    expect(workbook.SheetNames).toEqual(["Chiamate"])
    const sheet = workbook.Sheets.Chiamate!
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })).toEqual([
      [
        "Operatore",
        "Chiamate effettuate",
        "Risposte",
        "Appuntamenti fissati",
        "Non risposte",
      ],
      ["Verdi Bruno", 5, 3, 1, 2],
      ["Rossi Anna", 2, 2, 2, 0],
      ["Totale", 7, 5, 3, 2],
    ])
  })

  it("keeps the totals row with no operator", () => {
    const empty: CallStats = {
      rows: [],
      totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
    }
    const sheet = readBack(buildCallStatsWorkbook(empty)).Sheets.Chiamate!
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })).toHaveLength(2)
  })
})

describe("callStatsFileName", () => {
  it("names the file after the first and last day (AC13)", () => {
    expect(callStatsFileName({ from: "2026-09-15", to: "2026-10-23" })).toBe(
      "chiamate_2026-09-15_2026-10-23.xlsx"
    )
  })
})
