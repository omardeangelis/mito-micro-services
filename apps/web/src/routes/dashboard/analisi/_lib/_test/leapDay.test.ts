import { describe, expect, it } from "vitest"
import {
  type CallsByOperator,
  type FinancedSeries,
  type MyCallSeries,
} from "@mito/contract/analytics"
import { todayHours } from "@mito/domain/analytics/hours"
import { type Compare } from "@mito/domain/analytics/window"
import { exportHeader } from "../export"
import { adminCallsResult } from "../rankings"
import { formatDelta } from "../results"
import { averageResult, financedResult, myCallsResult } from "../trends"

// «Oggi» on 29 February with «Stesso periodo, anno prima»: the year before has
// no such day, so the server answers no comparison, and the page shows «—»
// (spec andamenti-chiamate AC20, as pagina-analisi AC11)

const leapDay = { from: "2028-02-29", to: "2028-02-29" }
const now = new Date("2028-02-29T15:20:00+01:00")
const NOTE = "Il 29 febbraio non ha lo stesso giorno l'anno prima"

const input = <D>(data: D, compare: Compare = "last-year") => ({
  data,
  range: "today" as const,
  compare,
  group: "hour" as const,
  role: "ADMIN" as const,
  completeSince: "2026-09-15",
})

const financed: FinancedSeries = {
  window: leapDay,
  comparison: null,
  days: [{ day: "2028-02-29", practices: 2, amount: 20_000 }],
  comparisonDays: [],
}

const hours = todayHours(now)
const series: MyCallSeries = {
  window: leapDay,
  comparison: null,
  hours: hours.map((slot) => ({
    ...slot,
    calls: 3,
    answered: 2,
    noAnswer: 1,
    appointments: 1,
  })),
  comparisonHours: null,
  days: [],
  comparisonDays: [],
}

const anna = {
  operatorId: 1,
  name: "Anna",
  surname: "Rossi",
  calls: 10,
  answered: 6,
  noAnswer: 4,
  appointments: 2,
}
const calls: CallsByOperator = {
  window: leapDay,
  comparison: null,
  hours,
  comparisonHours: null,
  rows: [anna],
  comparisonRows: null,
  comparisonTotals: null,
}

describe("«Oggi» on 29 February with the year before (AC20)", () => {
  it("«Finanziato totale» has «—» as its variation, with the reason", () => {
    const { kpi, table } = financedResult(input(financed))

    expect(formatDelta(kpi.delta)).toBe("—")
    expect(kpi.delta).toEqual({ kind: "none", note: NOTE })
    expect(table.columns.map((c) => c.header)).toContain(
      "Finanziato confronto (€)"
    )
    expect(table.rows[0]?.at(-1)).toBeNull()
  })

  it("«Finanziato medio per pratica» has «—» too", () => {
    expect(formatDelta(averageResult(input(financed)).kpi.delta)).toBe("—")
  })

  it("the operator's calls keep the comparison column, empty in every hour", () => {
    const { kpi, table } = myCallsResult(input(series))

    expect(formatDelta(kpi.delta)).toBe("—")
    expect(table.columns.at(-1)?.header).toBe("Chiamate confronto")
    expect(table.rows.map((row) => row.at(-1))).toEqual(hours.map(() => null))
  })

  it("the admin's ranking has «—» on the number and on the four totals", () => {
    const result = adminCallsResult(input(calls))

    expect(formatDelta(result.kpi.delta)).toBe("—")
    expect(result.totals?.map((t) => formatDelta(t.delta))).toEqual([
      "—",
      "—",
      "—",
      "—",
    ])
  })

  it("the files say the comparison has no day", () => {
    const header = exportHeader(financedResult(input(financed)), {
      window: leapDay,
      comparison: null,
      compare: "last-year",
      group: null,
      dataOf: "tutta la rete",
      extractedAt: now,
      today: { hours: null, comparisonHours: null },
    })

    expect(header).toContainEqual([
      "Confronto",
      "Stesso periodo, anno prima: —",
    ])
  })

  it("with «Nessuno» nothing is compared, as before", () => {
    const { kpi, table } = financedResult(input(financed, "none"))

    expect(kpi.delta).toBeNull()
    expect(table.columns.map((c) => c.header)).not.toContain(
      "Finanziato confronto (€)"
    )
  })
})
