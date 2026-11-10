import { describe, expect, it } from "vitest"
import { type CallsByOperator } from "@mito/contract/analytics"
import * as XLSX from "xlsx"
import { toCsv, toTsv, toWorkbook } from "../export"
import { adminCallsResult } from "../rankings"

// The totals of «Risposte per operatore» (spec andamenti-chiamate, AC13–AC16)

const october = { from: "2026-10-01", to: "2026-10-30" }

const operator = (
  operatorId: number,
  name: string,
  calls: number,
  answered: number,
  appointments: number
) => ({
  operatorId,
  name,
  surname: "Rossi",
  calls,
  answered,
  noAnswer: calls - answered,
  appointments,
})

const calls = (rows: CallsByOperator["rows"]): CallsByOperator => ({
  window: october,
  comparison: null,
  rows,
  comparisonTotals: null,
  hours: null,
  comparisonHours: null,
  comparisonRows: null,
})

const input = (data: CallsByOperator) => ({
  data,
  range: "30d" as const,
  compare: "none" as const,
  group: "auto" as const,
  role: "ADMIN" as const,
  completeSince: "2026-09-15",
})

describe("the «Totale» row of «Risposte per operatore» (AC15, AC16)", () => {
  it("ends the CSV with the sums and the rate of the sums", () => {
    const result = adminCallsResult(
      input(
        calls([operator(1, "Anna", 10, 4, 1), operator(2, "Bruno", 20, 16, 3)])
      )
    )

    const lines = toCsv([], result.table).slice(1).split("\r\n")

    // 20 answers on 30 calls: 66,7%
    expect(lines.at(-1)).toBe("Totale;30;20;10;4;66,7%")
  })

  const rows = [
    operator(1, "Anna", 10, 4, 1),
    operator(2, "Bruno", 20, 16, 3),
    operator(3, "Carla", 5, 5, 0),
  ]

  it("sums every count column and takes the rate of the sums", () => {
    const { table } = adminCallsResult(input(calls(rows)))

    expect(table.rows.at(-1)).toEqual([
      "Totale",
      35,
      25,
      10,
      4,
      (25 / 35) * 100,
    ])
  })

  it("stays last whatever the order of the rows, and is not a bar", () => {
    const result = adminCallsResult(input(calls([...rows].reverse())))

    expect(result.table.rows.map((r) => r[0])).toEqual([
      "Bruno Rossi",
      "Anna Rossi",
      "Carla Rossi",
      "Totale",
    ])
    expect(result.points.map((p) => p.name)).not.toContain("Totale")
    expect(result.points).toHaveLength(3)
  })

  it("has no row without operators", () => {
    expect(adminCallsResult(input(calls([]))).table.rows).toEqual([])
  })

  it("ends the TSV and the sheet with the same row", async () => {
    const { table } = adminCallsResult(input(calls(rows)))

    expect(toTsv([], table).split("\n").at(-1)).toBe(
      "Totale\t35\t25\t10\t4\t71,4%"
    )

    const workbook = await toWorkbook([{ name: "Calls", header: [], table }])
    const read = XLSX.read(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" })
    )
    const sheet = XLSX.utils.sheet_to_json<unknown[]>(read.Sheets.Calls!, {
      header: 1,
    })
    expect(sheet.at(-1)).toEqual([
      "Totale",
      35,
      25,
      10,
      4,
      expect.closeTo(71.43, 1),
    ])
  })
})

describe("the four totals above the chart (AC13, AC14)", () => {
  const withComparison = (
    comparisonTotals: CallsByOperator["comparisonTotals"]
  ) =>
    adminCallsResult(
      input({
        ...calls([
          operator(1, "Anna", 10, 4, 1),
          operator(2, "Bruno", 20, 16, 3),
        ]),
        comparisonTotals,
      })
    ).totals

  it("equal the sums of the table columns", () => {
    expect(withComparison(null)?.map((t) => [t.label, t.value])).toEqual([
      ["Chiamate", 30],
      ["Risposte", 20],
      ["Non risposte", 10],
      ["Appuntamenti", 4],
    ])
  })

  it("have no variation without a comparison", () => {
    expect(withComparison(null)?.map((t) => t.delta)).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it("have a variation in percent with a comparison", () => {
    // Before: 20 calls, 10 answered (10 not), 2 appointments
    const totals = withComparison({ calls: 20, answered: 10, appointments: 2 })

    expect(totals?.map((t) => t.delta)).toEqual([
      { kind: "percent", value: 50 },
      { kind: "percent", value: 100 },
      { kind: "percent", value: 0 },
      { kind: "percent", value: 100 },
    ])
  })
})
