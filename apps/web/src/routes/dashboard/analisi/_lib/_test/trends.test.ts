import { describe, expect, it } from "vitest"
import {
  type FinancedSeries,
  type MyCallSeries,
} from "@mito/contract/analytics"
import { formatCell, formatDelta, formatKpi } from "../results"
import {
  averageResult,
  financedResult,
  myAppointmentsResult,
  myCallsResult,
} from "../trends"

const october = { from: "2026-10-01", to: "2026-10-30" }
const september = { from: "2026-09-01", to: "2026-09-30" }

const series = (
  days: FinancedSeries["days"],
  comparisonDays: FinancedSeries["comparisonDays"] = [],
  comparison: FinancedSeries["comparison"] = september
): FinancedSeries => ({ window: october, comparison, days, comparisonDays })

const input = <D>(data: D, overrides: Record<string, unknown> = {}) => ({
  data,
  range: "30d" as const,
  compare: "previous" as const,
  group: "week" as const,
  role: "ADMIN" as const,
  completeSince: "2026-09-15",
  ...overrides,
})

describe("averageResult (AC3, AC24)", () => {
  it("leaves a bucket without practices as a gap, and «—» in its cell", () => {
    // Practices in the first and the last week only
    const result = averageResult(
      input(
        series([
          { day: "2026-10-02", practices: 2, amount: 10_000 },
          { day: "2026-10-27", practices: 1, amount: 4_000 },
        ])
      )
    )

    expect(result.status.kind).toBe("ready")
    const empty = result.points.find((p) => p.longLabel === "12 – 18 ott 2026")
    expect(empty?.current).toBeNull()
    const header = result.table.columns.map((c) => c.header)
    expect(header).toEqual([
      "Periodo",
      "Pratiche",
      "Finanziato medio (€)",
      "Medio confronto (€)",
    ])
    const row = result.table.rows.find((r) => r[0] === "12 – 18 ott 2026")
    expect(row?.[2]).toBeNull()
    expect(formatCell(row?.[2] ?? null, "euro")).toBe("—")
    // A mean of sums, not of means
    expect(result.points[0]?.current).toBe(5_000)
    expect(result.kpi.value).toBe(14_000 / 3)
  })

  it("has no variation when the comparison has no practices (AC12)", () => {
    const result = averageResult(
      input(series([{ day: "2026-10-02", practices: 2, amount: 10_000 }]))
    )
    expect(result.kpi.delta).toEqual({
      kind: "none",
      note: "Il confronto non ha pratiche: la variazione non si calcola",
    })
  })

  it("has no variation and no note when the window has no practices (AC12, AC19)", () => {
    const result = averageResult(
      input(series([], [{ day: "2026-09-02", practices: 2, amount: 10_000 }]))
    )
    expect(result.status.kind).toBe("empty")
    expect(result.kpi.delta).toBeNull()
  })
})

describe("financedResult (AC3, AC6, AC11, AC12, AC19)", () => {
  it("sums each bucket and its moved comparison days, «—» where the bucket isn't compared", () => {
    const result = financedResult(
      input(
        series(
          [
            { day: "2026-10-02", practices: 2, amount: 10_000 },
            { day: "2026-10-27", practices: 1, amount: 4_000 },
          ],
          [{ day: "2026-09-02", practices: 1, amount: 7_000 }]
        )
      )
    )
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Periodo",
      "Pratiche",
      "Finanziato (€)",
      "Finanziato confronto (€)",
    ])
    expect(result.table.rows[0]).toEqual(["1 – 4 ott 2026", 2, 10_000, 7_000])
    expect(result.kpi.value).toBe(14_000)
    // +100% on the whole comparison: 14.000 against 7.000
    expect(result.kpi.delta).toEqual({ kind: "percent", value: 100 })
    expect(formatDelta(result.kpi.delta)).toBe("+100%")
  })

  it("has no comparison columns nor variation with none (AC10)", () => {
    const result = financedResult(
      input(
        series([{ day: "2026-10-02", practices: 2, amount: 10_000 }], [], null),
        { compare: "none" }
      )
    )
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Periodo",
      "Pratiche",
      "Finanziato (€)",
    ])
    expect(result.kpi.delta).toBeNull()
  })

  it("says «—» with its note when the comparison is zero (AC12)", () => {
    const result = financedResult(
      input(series([{ day: "2026-10-02", practices: 2, amount: 10_000 }]))
    )
    expect(result.kpi.delta).toEqual({
      kind: "none",
      note: "Il confronto è a zero: la variazione non si calcola",
    })
    expect(formatDelta(result.kpi.delta)).toBe("—")
  })

  it("is empty with «Allarga a 90 giorni» from 30 days (AC15, AC19)", () => {
    const result = financedResult(input(series([])))
    expect(result.status).toMatchObject({
      kind: "empty",
      action: { label: "Allarga a 90 giorni", range: "90d" },
    })
  })

  it("speaks of «tuoi clienti» to the operator, with the scope note (AC6)", () => {
    const result = financedResult(input(series([]), { role: "OPERATORE" }))
    expect(result.scope).toBe("Numeri dei clienti assegnati a te")
    expect(
      result.status.kind === "empty" ? result.status.reason : ""
    ).toContain("dei tuoi clienti")
  })

  it("is number only on a single bucket, with «Mostra 7 giorni» (AC19)", () => {
    const result = financedResult(
      input(
        {
          ...series([{ day: "2026-10-30", practices: 1, amount: 1_000 }]),
          window: { from: "2026-10-30", to: "2026-10-30" },
          comparison: { from: "2026-10-29", to: "2026-10-29" },
        },
        { range: "custom", group: "auto" }
      )
    )
    expect(result.status).toMatchObject({
      kind: "kpiOnly",
      title: "Un solo intervallo",
      action: { label: "Mostra 7 giorni", range: "7d" },
    })
  })
})

const callSeries = (
  days: MyCallSeries["days"],
  comparisonDays: MyCallSeries["comparisonDays"] = []
): MyCallSeries => ({
  window: october,
  comparison: september,
  days,
  comparisonDays,
})

describe("the operator's calls (AC12, AC16, AC18, AC24)", () => {
  it("has seven columns for the calls and the note «Le tue chiamate»", () => {
    const result = myCallsResult(
      input(
        callSeries(
          [
            {
              day: "2026-10-02",
              calls: 10,
              answered: 6,
              noAnswer: 4,
              appointments: 2,
            },
          ],
          [
            {
              day: "2026-09-02",
              calls: 5,
              answered: 3,
              noAnswer: 2,
              appointments: 1,
            },
          ]
        ),
        { role: "OPERATORE" }
      )
    )
    expect(result.question).toBe(
      "Quante chiamate fai, e quante trovano risposta?"
    )
    expect(result.notes).toContain("Le tue chiamate")
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Periodo",
      "Chiamate",
      "Risposte",
      "Non risposte",
      "Appuntamenti",
      "Risposta (%)",
      "Chiamate confronto",
    ])
    expect(result.table.rows[0]).toEqual(["1 – 4 ott 2026", 10, 6, 4, 2, 60, 5])
    expect(formatCell(60, "percent")).toBe("60,0%")
  })

  it("marks a bucket with 14 answers as a small sample, and «—» without answers", () => {
    const result = myAppointmentsResult(
      input(
        callSeries([
          {
            day: "2026-10-02",
            calls: 20,
            answered: 14,
            noAnswer: 6,
            appointments: 7,
          },
          {
            day: "2026-10-06",
            calls: 3,
            answered: 0,
            noAnswer: 3,
            appointments: 0,
          },
        ]),
        { role: "OPERATORE" }
      )
    )
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Periodo",
      "Risposte",
      "Appuntamenti",
      "Tasso (%)",
      "Tasso confronto (%)",
      "Campione piccolo",
    ])
    expect(result.table.rows[0]).toEqual([
      "1 – 4 ott 2026",
      14,
      7,
      50,
      null,
      "sì",
    ])
    expect(result.table.rows[1]?.[3]).toBeNull()
    expect(result.notes).toContain("Meno di 15 risposte: tasso poco affidabile")
  })

  it("gives the variation of a rate in points, and 0% is a value (AC12)", () => {
    const result = myAppointmentsResult(
      input(
        callSeries(
          [
            {
              day: "2026-10-02",
              calls: 40,
              answered: 20,
              noAnswer: 20,
              appointments: 0,
            },
          ],
          [
            {
              day: "2026-09-02",
              calls: 40,
              answered: 31,
              noAnswer: 9,
              appointments: 1,
            },
          ]
        ),
        { role: "OPERATORE" }
      )
    )
    expect(result.kpi.value).toBe(0)
    expect(result.kpi.delta).toMatchObject({ kind: "points" })
    expect(formatDelta(result.kpi.delta)).toBe("-3,2 punti")
  })

  it("notes the complete data when the window starts before it, and is empty when it ends before (AC16)", () => {
    const early = { from: "2026-09-01", to: "2026-09-30" }
    const noted = myCallsResult(
      input(
        {
          ...callSeries([
            {
              day: "2026-09-20",
              calls: 1,
              answered: 1,
              noAnswer: 0,
              appointments: 0,
            },
          ]),
          window: early,
          comparison: { from: "2026-08-01", to: "2026-08-31" },
        },
        { role: "OPERATORE", range: "custom" }
      )
    )
    expect(noted.notes).toContain("Dati delle chiamate completi dal 15/09/2026")

    const before = myCallsResult(
      input(
        {
          ...callSeries([]),
          window: { from: "2026-08-01", to: "2026-08-31" },
          comparison: { from: "2026-07-01", to: "2026-07-31" },
        },
        { role: "OPERATORE", range: "custom" }
      )
    )
    expect(before.status).toMatchObject({
      kind: "empty",
      title: "Nessuna chiamata registrata in questa finestra",
    })
  })
})

describe("the formats of the results (AC12, AC24, AC41)", () => {
  it("gives a rise of a rate in points with its sign", () => {
    const result = myAppointmentsResult(
      input(
        callSeries(
          [
            {
              day: "2026-10-02",
              calls: 40,
              answered: 31,
              noAnswer: 9,
              appointments: 1,
            },
          ],
          [
            {
              day: "2026-09-02",
              calls: 40,
              answered: 20,
              noAnswer: 20,
              appointments: 0,
            },
          ]
        ),
        { role: "OPERATORE" }
      )
    )
    expect(formatDelta(result.kpi.delta)).toBe("+3,2 punti")
  })

  it("writes euro, counts and rates in Italian, rates always with one decimal", () => {
    expect(formatCell(12_500.5, "euro")).toBe("12.500,50")
    expect(formatCell(10_000, "euro")).toBe("10.000")
    expect(formatCell(3_725, "count")).toBe("3.725")
    expect(formatCell(54, "percent")).toBe("54,0%")
    expect(formatCell(54.06, "percent")).toBe("54,1%")
    expect(formatCell(null, "percent")).toBe("—")
    expect(formatCell("1 – 4 ott 2026", "text")).toBe("1 – 4 ott 2026")
  })

  it("writes the variation of an amount as a whole percent, and nothing without a comparison", () => {
    expect(formatDelta({ kind: "percent", value: -12.4 })).toBe("-12%")
    expect(formatDelta({ kind: "percent", value: 4 })).toBe("+4%")
    expect(formatDelta(null)).toBe("")
  })

  it("writes the number with its unit, and «—» without data", () => {
    expect(
      formatKpi({ value: 14_000, format: "euro", caption: "", delta: null })
    ).toBe("14.000 €")
    expect(
      formatKpi({ value: 57, format: "percent", caption: "", delta: null })
    ).toBe("57,0%")
    expect(
      formatKpi({ value: null, format: "percent", caption: "", delta: null })
    ).toBe("—")
  })
})

describe("the empty states without a wider window (AC15)", () => {
  it.each(["12m", "ytd"] as const)("has no action from %s", (range) => {
    const result = financedResult(input(series([]), { range }))
    expect(result.status).toMatchObject({ kind: "empty", action: null })
  })
})

describe("the complete call data (AC16)", () => {
  const oneCall = callSeries([
    { day: "2026-10-02", calls: 1, answered: 1, noAnswer: 0, appointments: 0 },
  ])

  it("notes it when only the comparison starts before it", () => {
    // The window starts on 1 ott, its comparison on 1 set, before the 15th
    const result = myCallsResult(input(oneCall, { role: "OPERATORE" }))
    expect(result.notes).toContain(
      "Dati delle chiamate completi dal 15/09/2026"
    )

    const later = myCallsResult(
      input(oneCall, { role: "OPERATORE", completeSince: "2026-08-01" })
    )
    expect(later.notes).toEqual(["Le tue chiamate"])
  })
})
