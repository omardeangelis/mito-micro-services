import type { FinancedSeries, MyCallSeries } from "@mito/contract/analytics"
import type { Role } from "@mito/contract/schemas"
import {
  type Bucket,
  bucketsOf,
  formatRange,
} from "@mito/domain/analytics/buckets"
import {
  type Compare,
  type DayRange,
  daysIn,
  type Group,
  resolveGroup,
} from "@mito/domain/analytics/window"
import {
  callNotes,
  callsEmptyStatus,
  callsKpi,
  isSmall,
  noAnswersStatus,
  rateKpi,
  SMALL_SAMPLE_NOTE,
  smallCell,
  type TrendInput,
} from "./calls"
import {
  type Action,
  type Cell,
  CHART_QUESTIONS,
  CHART_TITLES,
  type ChartResult,
  type Column,
  counted,
  type Delta,
  percentChange,
  ratio,
  type Status,
  sum,
  widen,
} from "./results"

/**
 * The charts in time of the Analysis page (AC3, AC11, AC12, AC18, AC19,
 * AC24): the endpoint's answer and the page's state turned into a
 * `ChartResult`. The window and the comparison are always the answer's,
 * never the controls' (AC30).
 */

/** A point of «Finanziato totale» and «Finanziato medio per pratica». */
export type TrendPoint = {
  label: string
  longLabel: string
  /** The amount, or the mean: null is a gap in the line */
  current: number | null
  comparison: number | null
  practices: number
}

/** A point of the operator's «Risposte per operatore» (AC18). */
export type CallsPoint = {
  label: string
  longLabel: string
  answered: number
  noAnswer: number
  comparisonCalls: number | null
}

/** A point of the operator's «Tasso di appuntamento» (AC18). */
export type RatePoint = {
  label: string
  longLabel: string
  /** Appointments per 100 answers; null without answers (AC24) */
  rate: number | null
  comparisonRate: number | null
  /** Fewer than 15 answers: the point is neutral */
  small: boolean
}

/** The questions of the operator's call charts (AC18), known without data (AC19) */
export const MY_CALLS_QUESTION =
  "Quante chiamate fai, e quante trovano risposta?"
export const MY_APPOINTMENTS_QUESTION =
  "Su cento tue risposte, quanti appuntamenti?"

export const OPERATOR_SCOPE = "Numeri dei clienti assegnati a te"
const NO_PRACTICES_COMPARISON =
  "Il confronto non ha pratiche: la variazione non si calcola"
const MY_CALLS = "Le tue chiamate"

const SINGLE_INTERVAL: Action = { label: "Mostra 7 giorni", range: "7d" }

/** The buckets of the answer's window, cut as the page asks (AC11, AC13). */
const bucketsFor = (
  answer: { window: DayRange; comparison: DayRange | null },
  group: Group,
  compare: Compare
): Bucket[] =>
  bucketsOf({
    window: answer.window,
    group: resolveGroup(group, daysIn(answer.window)),
    // The query of the answer asked for `compare`: its key holds it (D11)
    compare: answer.comparison === null ? "none" : compare,
    comparison: answer.comparison,
  })

/** The state of a chart with data: number only on a single interval (AC19). */
const readyOrSingle = (buckets: Bucket[]): Status =>
  buckets.length < 2
    ? {
        kind: "kpiOnly",
        title: "Un solo intervallo",
        reason:
          "La finestra è un solo intervallo: per l'andamento servono almeno due punti.",
        action: SINGLE_INTERVAL,
      }
    : { kind: "ready" }

/** The rows of an answer by day, so a bucket sums its own days instead of scanning every row. */
const indexByDay = <T extends { day: string }>(rows: readonly T[]) =>
  new Map(rows.map((row) => [row.day, row]))

/** The sum of `pick(row)` over the rows of `days`; a day without a row counts zero. */
const sumOver = <T extends { day: string }>(
  index: ReadonlyMap<string, T>,
  days: readonly string[],
  pick: (row: T) => number
) => {
  let total = 0
  for (const day of days) {
    const row = index.get(day)
    if (row !== undefined) total += pick(row)
  }
  return total
}

/** The sum over the comparison days of a bucket, or null when it isn't compared (AC11). */
const comparedSum = <T extends { day: string }>(
  index: ReadonlyMap<string, T>,
  bucket: Bucket,
  pick: (row: T) => number
) =>
  bucket.comparisonDays === null
    ? null
    : sumOver(index, bucket.comparisonDays, pick)

/**
 * `build` made once for each answer, group and comparison: every builder of an
 * answer reads the same buckets, so the page cuts them once, not once per chart.
 */
const memoBuckets = <D extends object, B>(
  build: (data: D, group: Group, compare: Compare) => B[]
) => {
  const cache = new WeakMap<D, Map<string, B[]>>()
  return (data: D, group: Group, compare: Compare): B[] => {
    const byKey = cache.get(data) ?? new Map<string, B[]>()
    cache.set(data, byKey)
    const key = `${group}|${compare}`
    const built = byKey.get(key) ?? build(data, group, compare)
    byKey.set(key, built)
    return built
  }
}

// --- Finanziato totale and medio -------------------------------------------

type FinancedBucket = {
  bucket: Bucket
  practices: number
  amount: number
  comparisonPractices: number | null
  comparisonAmount: number | null
}

const financedBuckets = memoBuckets(
  (data: FinancedSeries, group, compare): FinancedBucket[] => {
    const days = indexByDay(data.days)
    const comparisonDays = indexByDay(data.comparisonDays)
    return bucketsFor(data, group, compare).map((bucket) => ({
      bucket,
      practices: sumOver(days, bucket.days, (d) => d.practices),
      amount: sumOver(days, bucket.days, (d) => d.amount),
      comparisonPractices: comparedSum(
        comparisonDays,
        bucket,
        (d) => d.practices
      ),
      comparisonAmount: comparedSum(comparisonDays, bucket, (d) => d.amount),
    }))
  }
)

/** Whose practices: the operator's clients (AC6). */
const yourClients = (role: Role) =>
  role === "OPERATORE" ? " dei tuoi clienti" : ""

/** Whose numbers: the operator's line, none for the admin (AC6). */
export const scopeOf = (role: Role) =>
  role === "OPERATORE" ? OPERATOR_SCOPE : null

/** «Finanziato totale» (AC3, AC5, AC6, AC11, AC12, AC19). */
export function financedResult(
  input: TrendInput<FinancedSeries>
): ChartResult<TrendPoint> {
  const { data, role } = input
  const compared = data.comparison !== null
  const rows = financedBuckets(data, input.group, input.compare)
  const practices = sum(data.days, (d) => d.practices)
  const total = sum(data.days, (d) => d.amount)

  const status: Status =
    practices === 0
      ? {
          kind: "empty",
          title: "Nessuna pratica liquidata",
          reason: `Nel periodo ${formatRange(data.window)} non risulta nessuna pratica liquidata${yourClients(role)}.`,
          action: widen(input.range),
        }
      : readyOrSingle(rows.map((r) => r.bucket))

  const columns: Column[] = [
    { header: "Periodo", format: "text" },
    { header: "Pratiche", format: "count" },
    { header: "Finanziato (€)", format: "euro" },
    ...(compared
      ? [{ header: "Finanziato confronto (€)", format: "euro" } as const]
      : []),
  ]

  return {
    id: "financed",
    title: CHART_TITLES.financed,
    question: CHART_QUESTIONS.financed,
    status,
    kpi: {
      value: total,
      format: "euro",
      caption: counted(practices, "pratica liquidata", "pratiche liquidate"),
      // The whole comparison, also the days no bucket is compared with (AC11, AC12)
      delta: compared
        ? percentChange(
            total,
            sum(data.comparisonDays, (d) => d.amount)
          )
        : null,
    },
    points: rows.map((r) => ({
      label: r.bucket.label,
      longLabel: r.bucket.longLabel,
      current: r.amount,
      comparison: r.comparisonAmount,
      practices: r.practices,
    })),
    table: {
      columns,
      rows: rows.map((r): Cell[] => [
        r.bucket.longLabel,
        r.practices,
        r.amount,
        ...(compared ? [r.comparisonAmount] : []),
      ]),
    },
    notes: [],
    scope: scopeOf(role),
  }
}

/** A mean of sums: the amount over the practices; null without practices (AC3, AC24). */
const meanOf = (amount: number | null, practices: number | null) =>
  amount === null || practices === null || practices === 0
    ? null
    : amount / practices

/** «Finanziato medio per pratica» (AC3, AC6, AC11, AC12, AC19, AC24). */
export function averageResult(
  input: TrendInput<FinancedSeries>
): ChartResult<TrendPoint> {
  const { data, role } = input
  const compared = data.comparison !== null
  const rows = financedBuckets(data, input.group, input.compare)
  const practices = sum(data.days, (d) => d.practices)
  const mean = meanOf(
    sum(data.days, (d) => d.amount),
    practices
  )

  const status: Status =
    practices === 0
      ? {
          kind: "empty",
          title: "Nessuna pratica, nessuna media",
          reason: `La media esiste solo con almeno una pratica liquidata: nel periodo ${formatRange(data.window)} non ce n'è nessuna${yourClients(role)}.`,
          action: widen(input.range),
        }
      : readyOrSingle(rows.map((r) => r.bucket))

  const delta = (): Delta | null => {
    if (!compared) return null
    // Without practices in the window the empty state says it: no note
    if (mean === null) return null
    const comparisonMean = meanOf(
      sum(data.comparisonDays, (d) => d.amount),
      sum(data.comparisonDays, (d) => d.practices)
    )
    if (comparisonMean === null) {
      return { kind: "none", note: NO_PRACTICES_COMPARISON }
    }
    return percentChange(mean, comparisonMean)
  }

  const points = rows.map((r): TrendPoint => ({
    label: r.bucket.label,
    longLabel: r.bucket.longLabel,
    current: meanOf(r.amount, r.practices),
    comparison: meanOf(r.comparisonAmount, r.comparisonPractices),
    practices: r.practices,
  }))

  const columns: Column[] = [
    { header: "Periodo", format: "text" },
    { header: "Pratiche", format: "count" },
    { header: "Finanziato medio (€)", format: "euro" },
    ...(compared
      ? [{ header: "Medio confronto (€)", format: "euro" } as const]
      : []),
  ]

  return {
    id: "average",
    title: CHART_TITLES.average,
    question: CHART_QUESTIONS.average,
    status,
    kpi: {
      value: mean,
      format: "euro",
      caption: `su ${counted(practices, "pratica", "pratiche")}`,
      delta: delta(),
    },
    points,
    table: {
      columns,
      rows: points.map((p): Cell[] => [
        p.longLabel,
        p.practices,
        p.current,
        ...(compared ? [p.comparison] : []),
      ]),
    },
    notes: [],
    scope: scopeOf(role),
  }
}

// --- The operator's calls (AC16, AC18) -------------------------------------

type CallsBucket = {
  bucket: Bucket
  calls: number
  answered: number
  noAnswer: number
  appointments: number
  comparisonCalls: number | null
  comparisonAnswered: number | null
  comparisonAppointments: number | null
}

const callsBuckets = memoBuckets(
  (data: MyCallSeries, group, compare): CallsBucket[] => {
    const days = indexByDay(data.days)
    const comparisonDays = indexByDay(data.comparisonDays)
    return bucketsFor(data, group, compare).map((bucket) => ({
      bucket,
      calls: sumOver(days, bucket.days, (d) => d.calls),
      answered: sumOver(days, bucket.days, (d) => d.answered),
      noAnswer: sumOver(days, bucket.days, (d) => d.noAnswer),
      appointments: sumOver(days, bucket.days, (d) => d.appointments),
      comparisonCalls: comparedSum(comparisonDays, bucket, (d) => d.calls),
      comparisonAnswered: comparedSum(
        comparisonDays,
        bucket,
        (d) => d.answered
      ),
      comparisonAppointments: comparedSum(
        comparisonDays,
        bucket,
        (d) => d.appointments
      ),
    }))
  }
)

/** The empty state of the operator's call charts, or null (AC16, AC19). */
const callsEmpty = (input: TrendInput<MyCallSeries>, calls: number) =>
  callsEmptyStatus(
    input,
    calls,
    `Nel periodo ${formatRange(input.data.window)} non hai registrato chiamate.`
  )

/** The notes both call charts open with: whose calls, then the shared ones (AC16, AC18). */
const myCallNotes = (
  input: TrendInput<MyCallSeries>,
  ...extra: string[]
): string[] => [
  MY_CALLS,
  ...callNotes(
    input.data.window,
    input.data.comparison,
    input.completeSince,
    ...extra
  ),
]

/** The operator's «Risposte per operatore», in time (AC12, AC16, AC18, AC19). */
export function myCallsResult(
  input: TrendInput<MyCallSeries>
): ChartResult<CallsPoint> {
  const { data } = input
  const compared = data.comparison !== null
  const rows = callsBuckets(data, input.group, input.compare)
  const calls = sum(data.days, (d) => d.calls)
  const answered = sum(data.days, (d) => d.answered)

  const columns: Column[] = [
    { header: "Periodo", format: "text" },
    { header: "Chiamate", format: "count" },
    { header: "Risposte", format: "count" },
    { header: "Non risposte", format: "count" },
    { header: "Appuntamenti", format: "count" },
    { header: "Risposta (%)", format: "percent" },
    ...(compared
      ? [{ header: "Chiamate confronto", format: "count" } as const]
      : []),
  ]

  return {
    id: "calls",
    title: CHART_TITLES.calls,
    question: MY_CALLS_QUESTION,
    status:
      callsEmpty(input, calls) ?? readyOrSingle(rows.map((r) => r.bucket)),
    kpi: callsKpi(
      calls,
      answered,
      compared ? sum(data.comparisonDays, (d) => d.calls) : null
    ),
    points: rows.map((r) => ({
      label: r.bucket.label,
      longLabel: r.bucket.longLabel,
      answered: r.answered,
      noAnswer: r.noAnswer,
      comparisonCalls: r.comparisonCalls,
    })),
    table: {
      columns,
      rows: rows.map((r): Cell[] => [
        r.bucket.longLabel,
        r.calls,
        r.answered,
        r.noAnswer,
        r.appointments,
        ratio(r.answered, r.calls),
        ...(compared ? [r.comparisonCalls] : []),
      ]),
    },
    notes: myCallNotes(input),
    scope: null,
  }
}

/** The operator's «Tasso di appuntamento», in time (AC12, AC16, AC18, AC19, AC24). */
export function myAppointmentsResult(
  input: TrendInput<MyCallSeries>
): ChartResult<RatePoint> {
  const { data } = input
  const compared = data.comparison !== null
  const rows = callsBuckets(data, input.group, input.compare)
  const calls = sum(data.days, (d) => d.calls)
  const answered = sum(data.days, (d) => d.answered)
  const appointments = sum(data.days, (d) => d.appointments)

  const status: Status =
    callsEmpty(input, calls) ??
    (answered === 0
      ? noAnswersStatus(input.range)
      : readyOrSingle(rows.map((r) => r.bucket)))

  const points = rows.map((r): RatePoint => ({
    label: r.bucket.label,
    longLabel: r.bucket.longLabel,
    rate: ratio(r.appointments, r.answered),
    comparisonRate:
      r.comparisonAnswered === null || r.comparisonAppointments === null
        ? null
        : ratio(r.comparisonAppointments, r.comparisonAnswered),
    small: isSmall(r.answered),
  }))

  const notes = myCallNotes(
    input,
    ...(points.some((p) => p.small) ? [SMALL_SAMPLE_NOTE] : [])
  )

  const columns: Column[] = [
    { header: "Periodo", format: "text" },
    { header: "Risposte", format: "count" },
    { header: "Appuntamenti", format: "count" },
    { header: "Tasso (%)", format: "percent" },
    ...(compared
      ? [{ header: "Tasso confronto (%)", format: "percent" } as const]
      : []),
    { header: "Campione piccolo", format: "text" },
  ]

  return {
    id: "appointments",
    title: CHART_TITLES.appointments,
    question: MY_APPOINTMENTS_QUESTION,
    status,
    kpi: rateKpi(
      appointments,
      answered,
      compared
        ? {
            appointments: sum(data.comparisonDays, (d) => d.appointments),
            answered: sum(data.comparisonDays, (d) => d.answered),
          }
        : null
    ),
    points,
    table: {
      columns,
      rows: rows.map((r, i): Cell[] => [
        r.bucket.longLabel,
        r.answered,
        r.appointments,
        points[i]?.rate ?? null,
        ...(compared ? [points[i]?.comparisonRate ?? null] : []),
        smallCell(r.answered),
      ]),
    },
    notes,
    scope: null,
  }
}
