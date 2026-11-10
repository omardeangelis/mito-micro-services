import { describe, expect, it } from "vitest"
import { type FinancedSeries } from "@mito/contract/analytics"
import { averageResult, financedResult } from "../trends"

// «Finanziato totale» with «Oggi» (spec andamenti-chiamate, AC22)

const today = { from: "2026-11-10", to: "2026-11-10" }
const yesterday = { from: "2026-11-09", to: "2026-11-09" }

const series: FinancedSeries = {
  window: today,
  comparison: yesterday,
  days: [{ day: "2026-11-10", practices: 3, amount: 30_000 }],
  comparisonDays: [{ day: "2026-11-09", practices: 2, amount: 20_000 }],
}

describe("financedResult with «Oggi» (AC22)", () => {
  it("is number only because practices have only their day, with the change on yesterday", () => {
    const result = financedResult({
      data: series,
      range: "today",
      compare: "previous",
      group: "hour",
      role: "ADMIN",
      completeSince: "2026-09-15",
    })

    expect(result.status).toMatchObject({
      kind: "kpiOnly",
      reason: "Le pratiche hanno solo il giorno di liquidazione",
    })
    expect(result.kpi.delta).toEqual({ kind: "percent", value: 50 })
  })
})

const base = {
  range: "today" as const,
  compare: "previous" as const,
  group: "hour" as const,
  role: "ADMIN" as const,
  completeSince: "2026-09-15",
}

describe("averageResult with «Oggi» (AC22)", () => {
  it("is number only with the same reason, and the mean changes on yesterday", () => {
    const result = averageResult({
      ...base,
      data: {
        window: today,
        comparison: yesterday,
        days: [{ day: "2026-11-10", practices: 3, amount: 30_000 }],
        comparisonDays: [{ day: "2026-11-09", practices: 2, amount: 16_000 }],
      },
    })

    expect(result.status).toMatchObject({
      kind: "kpiOnly",
      reason: "Le pratiche hanno solo il giorno di liquidazione",
    })
    // 10.000 against 8.000 a practice
    expect(result.kpi.value).toBe(10_000)
    expect(result.kpi.delta).toEqual({ kind: "percent", value: 25 })
  })

  it("with no practices is empty, offering 7 days", () => {
    const result = averageResult({
      ...base,
      data: {
        window: today,
        comparison: yesterday,
        days: [],
        comparisonDays: [],
      },
    })

    expect(result.status).toMatchObject({
      kind: "empty",
      action: { label: "Allarga a 7 giorni", range: "7d" },
    })
    expect(result.kpi.value).toBeNull()
    expect(result.kpi.delta).toBeNull()
  })
})

describe("the other ranges keep the single interval (AC19)", () => {
  it("«Un solo intervallo» with «7 giorni» and one day of data", () => {
    const result = financedResult({
      data: { ...series, comparison: null, comparisonDays: [] },
      range: "7d",
      compare: "none",
      group: "day",
      role: "ADMIN",
      completeSince: "2026-09-15",
    })

    expect(result.status).toMatchObject({
      kind: "kpiOnly",
      title: "Un solo intervallo",
    })
  })
})
