import { describe, expect, it } from "vitest"
import {
  type BranchTotals,
  type CallsByOperator,
} from "@mito/contract/analytics"
import { formatCell } from "../results"
import {
  adminAppointmentsResult,
  adminCallsResult,
  branchesResult,
  progressResult,
} from "../rankings"

const october = { from: "2026-10-01", to: "2026-10-30" }
const september = { from: "2026-09-01", to: "2026-09-30" }

const input = <D>(data: D, overrides: Record<string, unknown> = {}) => ({
  data,
  range: "30d" as const,
  compare: "previous" as const,
  group: "auto" as const,
  role: "ADMIN" as const,
  completeSince: "2026-09-15",
  ...overrides,
})

const branches = (count: number): BranchTotals => ({
  window: october,
  comparison: september,
  rows: Array.from({ length: count }, (_, i) => ({
    branch: i === count - 1 ? null : `Sede ${i + 1}`,
    practices: 1,
    amount: (count - i) * 1_000,
  })),
  comparisonTotal: 10_000,
})

describe("branchesResult (AC3, AC4)", () => {
  it("draws the first 7 branches and «Altre» from 9 branches, and lists them all", () => {
    const result = branchesResult(input(branches(9)))

    expect(result.points).toHaveLength(8)
    expect(result.points.at(-1)?.name).toBe("Altre")
    expect(result.points.at(-1)?.amount).toBe(3_000)
    expect(result.table.rows).toHaveLength(9)
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Sede",
      "Pratiche",
      "Finanziato (€)",
      "Quota (%)",
    ])
  })

  it("draws every branch up to 8", () => {
    expect(branchesResult(input(branches(8))).points).toHaveLength(8)
    expect(
      branchesResult(input(branches(8))).points.map((p) => p.name)
    ).not.toContain("Altre")
  })

  it("names the practices without a branch «Senza sede», ordered by amount", () => {
    const result = branchesResult(
      input({
        ...branches(0),
        rows: [
          { branch: "Roma", practices: 1, amount: 1_000 },
          { branch: null, practices: 2, amount: 3_000 },
        ],
      })
    )
    expect(result.table.rows.map((r) => r[0])).toEqual(["Senza sede", "Roma"])
    expect(result.table.rows[0]?.[3]).toBe(75)
    expect(formatCell(75, "percent")).toBe("75,0%")
  })

  it("is number only with a single branch, and empty without practices (AC19)", () => {
    expect(
      branchesResult(
        input({
          ...branches(0),
          rows: [{ branch: "Roma", practices: 1, amount: 1_000 }],
        })
      ).status
    ).toMatchObject({ kind: "kpiOnly", title: "Una sola sede" })
    expect(branchesResult(input(branches(0))).status).toMatchObject({
      kind: "empty",
      action: { label: "Allarga a 90 giorni", range: "90d" },
    })
  })
})

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

const calls = (
  rows: CallsByOperator["rows"],
  comparisonTotals: CallsByOperator["comparisonTotals"] = {
    calls: 100,
    answered: 50,
    appointments: 10,
  }
): CallsByOperator => ({
  window: october,
  comparison: september,
  rows,
  comparisonTotals,
})

describe("adminCallsResult (AC3, AC12)", () => {
  it("orders by calls, with the answer rate, and varies on the calls", () => {
    const result = adminCallsResult(
      input(
        calls([
          operator(1, "Anna", 40, 20, 5),
          operator(2, "Bruno", 80, 60, 12),
        ])
      )
    )
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Operatore",
      "Chiamate",
      "Risposte",
      "Non risposte",
      "Appuntamenti",
      "Risposta (%)",
    ])
    expect(result.table.rows).toEqual([
      ["Bruno Rossi", 80, 60, 20, 12, 75],
      ["Anna Rossi", 40, 20, 20, 5, 50],
    ])
    expect(result.kpi.value).toBe(120)
    expect(result.kpi.delta).toEqual({ kind: "percent", value: 20 })
  })

  it("is empty without calls, and notes the complete data (AC16, AC19)", () => {
    const result = adminCallsResult(
      input(
        { ...calls([]), window: { from: "2026-09-01", to: "2026-09-30" } },
        { range: "custom" }
      )
    )
    expect(result.status.kind).toBe("empty")
    expect(result.notes).toContain(
      "Dati delle chiamate completi dal 15/09/2026"
    )

    const before = adminCallsResult(
      input(
        { ...calls([]), window: { from: "2026-08-01", to: "2026-08-31" } },
        { range: "custom" }
      )
    )
    expect(before.status).toMatchObject({
      kind: "empty",
      title: "Nessuna chiamata registrata in questa finestra",
    })
  })
})

describe("adminAppointmentsResult (AC3, AC12, AC25)", () => {
  it("orders by rate, puts small samples last and neutral, with the note", () => {
    const result = adminAppointmentsResult(
      input(
        calls([
          operator(1, "Anna", 40, 20, 5),
          operator(2, "Bruno", 80, 60, 30),
          operator(3, "Carla", 20, 14, 14),
        ])
      )
    )
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Operatore",
      "Risposte",
      "Appuntamenti",
      "Tasso (%)",
      "Campione piccolo",
    ])
    expect(result.table.rows.map((r) => r[0])).toEqual([
      "Bruno Rossi",
      "Anna Rossi",
      "Carla Rossi",
    ])
    expect(result.table.rows[2]?.[4]).toBe("sì")
    expect(result.points.at(-1)).toMatchObject({ small: true })
    expect(result.notes).toContain("Meno di 15 risposte: tasso poco affidabile")
    // 49 on 94 answers against 10 on 50: +32,1 points
    expect(result.kpi.delta).toMatchObject({ kind: "points" })
    expect(
      result.kpi.delta?.kind === "points" ? result.kpi.delta.value : 0
    ).toBeCloseTo(32.13, 1)
  })
})

describe("the operator rankings draw the first 8 (AC3, AC4, AC19)", () => {
  /** `count` operators, each with fewer calls and appointments than the one before */
  const many = (count: number) =>
    calls(
      Array.from({ length: count }, (_, i) =>
        operator(
          i + 1,
          `Op${String(i + 1).padStart(2, "0")}`,
          100 - i,
          60,
          30 - i
        )
      )
    )
  const MORE =
    "Il grafico mostra i primi 8 operatori su 12: la tabella e il file li elencano tutti."

  it("draws the first 8 by calls, and lists them all in the table", () => {
    const result = adminCallsResult(input(many(12)))

    expect(result.points.map((p) => p.name)).toEqual(
      result.table.rows.slice(0, 8).map((r) => r[0])
    )
    expect(result.table.rows).toHaveLength(12)
    expect(result.notes).toContain(MORE)
  })

  it("draws the first 8 by rate, and lists them all in the table", () => {
    const result = adminAppointmentsResult(input(many(12)))

    expect(result.points.map((p) => p.name)).toEqual(
      result.table.rows.slice(0, 8).map((r) => r[0])
    )
    expect(result.table.rows).toHaveLength(12)
    expect(result.notes).toContain(MORE)
  })

  /**
   * 12 operators whose input order, name order and the two rankings all
   * differ; Zeno has the best rate on a small sample (1 answer), so last
   */
  const mixed = () =>
    calls([
      operator(1, "Zeno", 2, 1, 1),
      ...Array.from({ length: 11 }, (_, i) =>
        operator(
          i + 2,
          `Op${String(11 - i).padStart(2, "0")}`,
          20 + ((i * 7) % 11) * 10,
          40,
          3 + ((i * 5) % 11)
        )
      ),
    ])

  it("draws the bars in the order of the table, whatever the input order", () => {
    for (const build of [adminCallsResult, adminAppointmentsResult]) {
      const result = build(input(mixed()))
      const order = result.table.rows.map((r) => r[0])
      expect(result.points.map((p) => p.name)).toEqual(order.slice(0, 8))
      expect(order).not.toEqual(mixed().rows.map((r) => `${r.name} Rossi`))
    }
    const rate = adminAppointmentsResult(input(mixed()))
    expect(rate.table.rows.at(-1)?.[0]).toBe("Zeno Rossi")
    // The small sample is out of the bars, still noted for the table (AC25)
    expect(rate.points.some((p) => p.small)).toBe(false)
    expect(rate.notes).toContain("Meno di 15 risposte: tasso poco affidabile")
  })

  it("notes nothing about bars on an empty chart (AC31)", () => {
    for (const build of [adminCallsResult, adminAppointmentsResult]) {
      const result = build(
        input(
          { ...mixed(), window: { from: "2026-08-01", to: "2026-08-31" } },
          { range: "custom" }
        )
      )
      expect(result.status.kind).toBe("empty")
      expect(result.notes.some((n) => n.startsWith("Il grafico mostra"))).toBe(
        false
      )
      expect(result.notes).not.toContain(
        "Meno di 15 risposte: tasso poco affidabile"
      )
    }
  })

  it("draws every operator up to 8, with no note", () => {
    for (const build of [adminCallsResult, adminAppointmentsResult]) {
      const result = build(input(many(8)))
      expect(result.points).toHaveLength(8)
      expect(result.notes.some((n) => n.startsWith("Il grafico mostra"))).toBe(
        false
      )
    }
  })
})

describe("progressResult (AC3, AC7)", () => {
  it("lists «Con esito», then «Da chiamare»", () => {
    const result = progressResult({ data: { done: 120, todo: 80 } })
    expect(result.table.columns.map((c) => c.header)).toEqual([
      "Stato",
      "Contatti",
    ])
    expect(result.table.rows).toEqual([
      ["Con esito", 120],
      ["Da chiamare", 80],
    ])
    expect(result.kpi.value).toBe(60)
  })

  it("is empty without contacts, with no window to widen", () => {
    expect(progressResult({ data: { done: 0, todo: 0 } }).status).toMatchObject(
      { kind: "empty", action: null }
    )
  })
})

describe("additions (AC15, AC41)", () => {
  it("writes a rounded share with one decimal: «54,0%»", () => {
    const result = branchesResult(
      input({
        ...branches(0),
        rows: [
          { branch: "Roma", practices: 1, amount: 54 },
          { branch: "Milano", practices: 1, amount: 46 },
        ],
      })
    )
    expect(formatCell(result.table.rows[0]?.[3] ?? null, "percent")).toBe(
      "54,0%"
    )
  })

  it("offers no widening from 12 months or the current year", () => {
    for (const range of ["12m", "ytd"] as const) {
      expect(
        branchesResult(input(branches(0), { range })).status
      ).toMatchObject({ kind: "empty", action: null })
    }
  })

  it("counts one branch in the singular and varies on the comparison total", () => {
    const result = branchesResult(input(branches(3)))
    expect(result.kpi).toMatchObject({ value: 3, caption: "sedi" })
    // 6.000 against 10.000
    expect(result.kpi.delta).toEqual({ kind: "percent", value: -40 })
    expect(
      branchesResult(input({ ...branches(3), comparisonTotal: 0 })).kpi.delta
    ).toMatchObject({ kind: "none" })
    expect(
      branchesResult(input({ ...branches(3), comparisonTotal: null })).kpi.delta
    ).toBeNull()
  })

  it("shows 0% as a value and «—» without answers in the appointments rate", () => {
    const result = adminAppointmentsResult(
      input(
        calls([operator(1, "Anna", 40, 20, 0)], {
          calls: 10,
          answered: 0,
          appointments: 0,
        })
      )
    )
    expect(result.kpi.value).toBe(0)
    expect(result.kpi.delta).toMatchObject({ kind: "none" })
    expect(
      adminAppointmentsResult(input(calls([operator(1, "Anna", 5, 0, 0)])))
        .table.rows[0]?.[3]
    ).toBeNull()
  })

  it("describes the progress as a share", () => {
    const result = progressResult({ data: { done: 120, todo: 80 } })
    expect(result.kpi).toMatchObject({
      format: "percent",
      caption: "120 contatti su 200 con esito",
      delta: null,
    })
    expect(progressResult({ data: { done: 0, todo: 0 } }).kpi.value).toBeNull()
  })
})
