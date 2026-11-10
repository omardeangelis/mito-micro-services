import type { BranchTotals, CallsByOperator } from "@mito/contract/analytics"
import { formatRange } from "@mito/domain/analytics/buckets"
import { totalsOf } from "@mito/domain/export/calls"
import {
  BEFORE_EIGHT_NOTE,
  BEFORE_EIGHT_STATUS,
  beforeEight,
  callNotes,
  callsEmptyStatus,
  callsKpi,
  isSmall,
  noAnswersStatus,
  rateKpi,
  SMALL_SAMPLE_NOTE,
  smallCell,
  type TrendInput,
  underSample,
} from "./calls"
import {
  type Cell,
  CHART_QUESTIONS,
  CHART_TITLES,
  type ChartResult,
  type Column,
  counted,
  formatCount,
  LEAP_DAY_DELTA,
  leapDayGap,
  percentChange,
  ratio,
  type Status,
  sum,
  type Total,
  widen,
  withGap,
} from "./results"

/**
 * The charts that are not time series (AC3, AC4, AC7, AC12, AC15, AC16, AC19,
 * AC24, AC25): the rankings of the ADMIN and «Contatti con esito», turned into
 * a `ChartResult`. No React here.
 */

/**
 * The bars of a ranking, so it is as tall as its skeleton (AC4, AC19): the
 * branches beyond them go in «Altre», the operators beyond them only in the
 * table and the file.
 */
const MAX_BARS = 8

// --- Finanziato per sede ------------------------------------------------------

/** A bar of «Finanziato per sede» (AC4). */
export type BranchPoint = {
  /** The label on the axis */
  name: string
  /** The name in the tooltip: the whole branch name */
  fullName: string
  amount: number
}

const NO_BRANCH = "Senza sede"

/** «Finanziato per sede» (AC3, AC4, AC5, AC12, AC19, AC41). */
export function branchesResult(
  input: TrendInput<BranchTotals>
): ChartResult<BranchPoint> {
  const { data } = input
  const rows = data.rows
    .map((row) => ({ ...row, name: row.branch ?? NO_BRANCH }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "it"))
  const total = sum(rows, (r) => r.amount)

  const status = ((): Status => {
    if (rows.length === 0) {
      return {
        kind: "empty",
        title: "Nessuna pratica liquidata",
        reason: `Nel periodo ${formatRange(data.window)} non risulta nessuna pratica liquidata.`,
        action: widen(input.range),
      }
    }
    if (rows.length === 1) {
      return {
        kind: "kpiOnly",
        title: "Una sola sede",
        reason:
          "Una sola sede ha pratiche liquidate nella finestra: non c'è niente da confrontare.",
        action: null,
      }
    }
    return { kind: "ready" }
  })()

  // All the bars up to 8 branches; from 9, the first 7 and «Altre» (AC4)
  const bars: BranchPoint[] = rows.map((r) => ({
    name: r.name,
    fullName: r.name,
    amount: r.amount,
  }))
  const points: BranchPoint[] =
    bars.length <= MAX_BARS
      ? bars
      : [
          ...bars.slice(0, MAX_BARS - 1),
          {
            name: "Altre",
            fullName: `Altre ${bars.length - (MAX_BARS - 1)} sedi`,
            amount: sum(bars.slice(MAX_BARS - 1), (b) => b.amount),
          },
        ]

  const columns: Column[] = [
    { header: "Sede", format: "text" },
    { header: "Pratiche", format: "count" },
    { header: "Finanziato (€)", format: "euro" },
    { header: "Quota (%)", format: "percent" },
  ]

  return {
    id: "branches",
    title: CHART_TITLES.branches,
    question: CHART_QUESTIONS.branches,
    status,
    kpi: {
      value: rows.length,
      format: "count",
      caption: rows.length === 1 ? "sede" : "sedi",
      // The financed amount of the whole window against the whole comparison (AC12)
      delta:
        data.comparisonTotal === null
          ? null
          : percentChange(total, data.comparisonTotal),
    },
    points,
    table: {
      columns,
      rows: rows.map((r): Cell[] => [
        r.name,
        r.practices,
        r.amount,
        ratio(r.amount, total),
      ]),
    },
    notes: [],
    scope: null,
  }
}

// --- The admin's calls (AC3, AC12, AC16, AC25) ---------------------------------

const operatorName = (row: { name: string; surname: string }) =>
  `${row.name} ${row.surname}`.trim()

/** A bar of the admin's «Risposte per operatore». */
export type OperatorCallsPoint = {
  name: string
  fullName: string
  answered: number
  noAnswer: number
}

/** A bar of the admin's «Tasso di appuntamento». */
export type OperatorRatePoint = {
  name: string
  fullName: string
  /** Appointments per 100 answers; null without answers (AC24) */
  rate: number | null
  /** Fewer than 15 answers: the bar is neutral (AC25) */
  small: boolean
}

/** The note of an operator ranking with more operators than bars (AC4). */
const firstBarsNote = (operators: number): string[] =>
  operators > MAX_BARS
    ? [
        `Il grafico mostra i primi ${MAX_BARS} operatori su ${formatCount(operators)}: la tabella e il file li elencano tutti.`,
      ]
    : []

/** The notes about the bars, only when they are drawn (AC4, AC25, AC31). */
const barNotes = (status: Status, ...notes: string[]): string[] =>
  status.kind === "ready" ? notes : []

/** The empty state of the admin's call charts, or null (AC16, AC19). */
const callsEmpty = (input: TrendInput<CallsByOperator>, calls: number) =>
  callsEmptyStatus(
    input,
    calls,
    `Nel periodo ${formatRange(input.data.window)} non risultano chiamate registrate.`
  )

/** The notes of the admin's call charts: since when the data is complete, then `extra` (AC16). */
const adminNotes = (
  input: TrendInput<CallsByOperator>,
  ...extra: string[]
): string[] =>
  callNotes(
    input.data.window,
    input.data.comparison,
    input.completeSince,
    ...extra
  )

type OperatorRow = CallsByOperator["rows"][number]

/**
 * The rows the admin's rankings count, and the totals they are compared with:
 * the answer's, or before 08 with «Oggi» yesterday's 11–19, compared with
 * nothing, with the note above the chart (AC21, AC24, D1). `status` is the
 * empty state before 08 without yesterday's hours, or null.
 */
function adminRows(data: CallsByOperator): {
  rows: readonly OperatorRow[]
  comparisonTotals: CallsByOperator["comparisonTotals"]
  status: Status | null
  lead: { lead?: string }
} {
  switch (beforeEight(data)) {
    case "yesterday":
      return {
        rows: data.comparisonRows ?? [],
        comparisonTotals: null,
        status: null,
        lead: { lead: BEFORE_EIGHT_NOTE },
      }
    case "empty":
      return {
        rows: [],
        comparisonTotals: null,
        status: BEFORE_EIGHT_STATUS,
        lead: {},
      }
    case null:
      return {
        rows: data.rows,
        comparisonTotals: data.comparisonTotals,
        status: null,
        lead: {},
      }
  }
}

/** The «Totale» row: the sums, and the rate of the sums (AC15). */
const totalsRow = (rows: readonly OperatorRow[]): Cell[] => {
  const total = totalsOf(rows)
  return [
    "Totale",
    total.calls,
    total.answered,
    total.noAnswer,
    total.appointments,
    ratio(total.answered, total.calls),
  ]
}

/** The four totals of the window above the chart, each with its variation (AC13, AC14). */
const callTotals = (
  rows: readonly OperatorRow[],
  before: CallsByOperator["comparisonTotals"],
  gap: boolean
): Total[] => {
  const now = totalsOf(rows)
  const delta = (current: number, comparison: number | undefined) =>
    gap
      ? LEAP_DAY_DELTA
      : before === null || comparison === undefined
        ? null
        : percentChange(current, comparison)
  return [
    {
      label: "Chiamate",
      value: now.calls,
      delta: delta(now.calls, before?.calls),
    },
    {
      label: "Risposte",
      value: now.answered,
      delta: delta(now.answered, before?.answered),
    },
    {
      label: "Non risposte",
      value: now.noAnswer,
      delta: delta(
        now.noAnswer,
        before === null ? undefined : before.calls - before.answered
      ),
    },
    {
      label: "Appuntamenti",
      value: now.appointments,
      delta: delta(now.appointments, before?.appointments),
    },
  ]
}

/** The admin's «Risposte per operatore», a ranking (AC3, AC12, AC16, AC19). */
export function adminCallsResult(
  input: TrendInput<CallsByOperator>
): ChartResult<OperatorCallsPoint> {
  const shown = adminRows(input.data)
  const rows = [...shown.rows].sort(
    (a, b) =>
      b.calls - a.calls || operatorName(a).localeCompare(operatorName(b), "it")
  )
  const calls = sum(rows, (r) => r.calls)
  const answered = sum(rows, (r) => r.answered)
  const status: Status = shown.status ??
    callsEmpty(input, calls) ?? { kind: "ready" }

  const columns: Column[] = [
    { header: "Operatore", format: "text" },
    { header: "Chiamate", format: "count" },
    { header: "Risposte", format: "count" },
    { header: "Non risposte", format: "count" },
    { header: "Appuntamenti", format: "count" },
    { header: "Risposta (%)", format: "percent" },
  ]

  return {
    id: "calls",
    title: CHART_TITLES.calls,
    question: CHART_QUESTIONS.calls,
    status,
    kpi: withGap(
      leapDayGap(input, input.data.comparison),
      callsKpi(calls, answered, shown.comparisonTotals?.calls ?? null)
    ),
    points: rows.slice(0, MAX_BARS).map((r) => ({
      name: operatorName(r),
      fullName: operatorName(r),
      answered: r.answered,
      noAnswer: r.noAnswer,
    })),
    table: {
      columns,
      rows: [
        ...rows.map((r): Cell[] => [
          operatorName(r),
          r.calls,
          r.answered,
          r.noAnswer,
          r.appointments,
          ratio(r.answered, r.calls),
        ]),
        // Last, whatever the order; not a bar (AC15). None without rows
        ...(rows.length === 0 ? [] : [totalsRow(rows)]),
      ],
      totalRow: rows.length > 0,
    },
    notes: adminNotes(
      input,
      ...barNotes(status, ...firstBarsNote(rows.length))
    ),
    scope: null,
    totals: callTotals(
      rows,
      shown.comparisonTotals,
      leapDayGap(input, input.data.comparison)
    ),
    ...shown.lead,
  }
}

/** The admin's «Tasso di appuntamento», a ranking (AC3, AC12, AC16, AC19, AC24, AC25). */
export function adminAppointmentsResult(
  input: TrendInput<CallsByOperator>
): ChartResult<OperatorRatePoint> {
  const shown = adminRows(input.data)
  const rows = shown.rows
    .map((r) => ({
      name: operatorName(r),
      answered: r.answered,
      appointments: r.appointments,
      calls: r.calls,
      rate: ratio(r.appointments, r.answered),
      small: isSmall(r.answered),
    }))
    // By rate; the samples under 15 answers (none included) come last (AC25)
    .sort(
      (a, b) =>
        Number(underSample(a.answered)) - Number(underSample(b.answered)) ||
        (b.rate ?? -1) - (a.rate ?? -1) ||
        a.name.localeCompare(b.name, "it")
    )
  const calls = sum(rows, (r) => r.calls)
  const answered = sum(rows, (r) => r.answered)
  const appointments = sum(rows, (r) => r.appointments)

  const status: Status =
    shown.status ??
    callsEmpty(input, calls) ??
    (answered === 0 ? noAnswersStatus(input.range) : { kind: "ready" })

  const columns: Column[] = [
    { header: "Operatore", format: "text" },
    { header: "Risposte", format: "count" },
    { header: "Appuntamenti", format: "count" },
    { header: "Tasso (%)", format: "percent" },
    { header: "Campione piccolo", format: "text" },
  ]

  return {
    id: "appointments",
    title: CHART_TITLES.appointments,
    question: CHART_QUESTIONS.appointments,
    status,
    kpi: withGap(
      leapDayGap(input, input.data.comparison),
      rateKpi(appointments, answered, shown.comparisonTotals)
    ),
    points: rows.slice(0, MAX_BARS).map((r) => ({
      name: r.name,
      fullName: r.name,
      rate: r.rate,
      small: r.small,
    })),
    table: {
      columns,
      rows: rows.map((r): Cell[] => [
        r.name,
        r.answered,
        r.appointments,
        r.rate,
        smallCell(r.answered),
      ]),
    },
    notes: adminNotes(
      input,
      ...barNotes(
        status,
        ...firstBarsNote(rows.length),
        ...(rows.some((r) => r.small) ? [SMALL_SAMPLE_NOTE] : [])
      )
    ),
    scope: null,
    ...shown.lead,
  }
}

// --- Contatti con esito (AC3, AC7) ---------------------------------------------

/** What «Contatti con esito» draws: the active contacts, with and without an outcome. */
export type ProgressPoint = { done: number; todo: number }

/**
 * «Contatti con esito», a snapshot of now: it has no window and no comparison
 * (AC7), so it takes the answer alone.
 */
export function progressResult(input: {
  data: ProgressPoint
}): ChartResult<ProgressPoint> {
  const { done, todo } = input.data
  const all = done + todo

  return {
    id: "progress",
    title: CHART_TITLES.progress,
    question: CHART_QUESTIONS.progress,
    status:
      all === 0
        ? {
            kind: "empty",
            title: "Nessun contatto attivo",
            reason:
              "Non ci sono contatti attivi da lavorare: un nuovo import o un'assegnazione li riporta qui.",
            action: null,
          }
        : { kind: "ready" },
    kpi: {
      value: ratio(done, all),
      format: "percent",
      caption: `${counted(done, "contatto", "contatti")} su ${formatCount(all)} con esito`,
      delta: null,
    },
    points: [{ done, todo }],
    table: {
      columns: [
        { header: "Stato", format: "text" },
        { header: "Contatti", format: "count" },
      ],
      rows: [
        ["Con esito", done],
        ["Da chiamare", todo],
      ],
    },
    notes: [],
    scope: null,
  }
}
