import type {
  CallHour,
  FinancedSeries,
  MyCallSeries,
} from "@mito/contract/analytics"
import type { Role } from "@mito/contract/schemas"
import {
  type Bucket,
  bucketsOf,
  formatRange,
} from "@mito/domain/analytics/buckets"
import { type HourSlot, hourLabel } from "@mito/domain/analytics/hours"
import { romeTime } from "@mito/domain/contact/time"
import {
  type Compare,
  type DayRange,
  daysIn,
  type Group,
  resolveGroup,
} from "@mito/domain/analytics/window"
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
  LEAP_DAY_DELTA,
  leapDayGap,
  percentChange,
  ratio,
  type Status,
  sum,
  widen,
  withGap,
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
  /** Null before 08 with «Oggi»: no bar of today (AC24 of andamenti-chiamate) */
  answered: number | null
  noAnswer: number | null
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
const readyOrSingle = (intervals: number): Status =>
  intervals < 2
    ? {
        kind: "kpiOnly",
        title: "Un solo intervallo",
        reason:
          "La finestra è un solo intervallo: per l'andamento servono almeno due punti.",
        action: SINGLE_INTERVAL,
      }
    : { kind: "ready" }

/**
 * «Oggi»: the payout date has no hour, so the financed charts are one number
 * with no line (AC22).
 */
const dayOnlyStatus = (): Status => ({
  kind: "kpiOnly",
  title: "Solo il giorno",
  reason: "Le pratiche hanno solo il giorno di liquidazione",
  action: null,
})

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
  const gap = leapDayGap(input, data.comparison)
  const compared = data.comparison !== null || gap
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
      : input.range === "today"
        ? dayOnlyStatus()
        : readyOrSingle(rows.length)

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
      delta: gap
        ? LEAP_DAY_DELTA
        : compared
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
  const gap = leapDayGap(input, data.comparison)
  const compared = data.comparison !== null || gap
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
      : input.range === "today"
        ? dayOnlyStatus()
        : readyOrSingle(rows.length)

  const delta = (): Delta | null => {
    if (!compared) return null
    // Without practices in the window the empty state says it: no note
    if (mean === null) return null
    if (gap) return LEAP_DAY_DELTA
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

/** An interval of the operator's call charts: a bucket of days, or an hour of «Oggi». */
type CallsRow = {
  label: string
  longLabel: string
  /** Null before 08 with «Oggi»: the row is an hour of yesterday (AC24) */
  calls: number | null
  answered: number | null
  noAnswer: number | null
  appointments: number | null
  comparisonCalls: number | null
  comparisonAnswered: number | null
  comparisonAppointments: number | null
}

const callsBuckets = memoBuckets(
  (data: MyCallSeries, group, compare): CallsRow[] => {
    const days = indexByDay(data.days)
    const comparisonDays = indexByDay(data.comparisonDays)
    return bucketsFor(data, group, compare).map((bucket) => ({
      label: bucket.label,
      longLabel: bucket.longLabel,
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

/** The labels of an hour: "15:00" on the axis, "15:00–15:20 (in corso)" in the table (AC7). */
const hourLabels = (slot: HourSlot) => ({
  label: romeTime(slot.start),
  longLabel: hourLabel(slot),
})

/**
 * One row per hour of «Oggi», each compared with the hour of the same index
 * (AC20, AC21). Before 08 the rows are yesterday's hours, with today's values
 * empty (AC24).
 */
function hourRows(
  hours: readonly CallHour[],
  comparison: readonly CallHour[] | null
): CallsRow[] {
  if (hours.length === 0) {
    return (comparison ?? []).map((slot) => ({
      ...hourLabels(slot),
      calls: null,
      answered: null,
      noAnswer: null,
      appointments: null,
      comparisonCalls: slot.calls,
      comparisonAnswered: slot.answered,
      comparisonAppointments: slot.appointments,
    }))
  }
  return hours.map((slot, index) => {
    const before = comparison?.[index]
    return {
      ...hourLabels(slot),
      calls: slot.calls,
      answered: slot.answered,
      noAnswer: slot.noAnswer,
      appointments: slot.appointments,
      comparisonCalls: before?.calls ?? null,
      comparisonAnswered: before?.answered ?? null,
      comparisonAppointments: before?.appointments ?? null,
    }
  })
}

/** The intervals of the operator's charts: hours with «Oggi» (AC21), buckets of days otherwise. */
const callRows = (input: TrendInput<MyCallSeries>): CallsRow[] =>
  input.data.hours === null
    ? callsBuckets(input.data, input.group, input.compare)
    : hourRows(input.data.hours, input.data.comparisonHours)

/**
 * The counts the number sums: the hours with «Oggi», the days otherwise.
 * Before 08 with yesterday's hours nothing is compared: today has no hours
 * (AC24).
 */
type Counts = { calls: number; answered: number; appointments: number }

const callCounts = (data: MyCallSeries) => {
  const own: readonly Counts[] = data.hours ?? data.days
  const theirs: readonly Counts[] = data.comparisonHours ?? data.comparisonDays
  const compared = data.comparison !== null && beforeEight(data) === null
  return {
    calls: sum(own, (d) => d.calls),
    answered: sum(own, (d) => d.answered),
    appointments: sum(own, (d) => d.appointments),
    comparison: compared
      ? {
          calls: sum(theirs, (d) => d.calls),
          answered: sum(theirs, (d) => d.answered),
          appointments: sum(theirs, (d) => d.appointments),
        }
      : null,
  }
}

/**
 * The state before 08 with «Oggi», or null for the usual one: yesterday's
 * hours are drawn even without calls (AC24).
 */
const beforeEightStatus = (
  data: MyCallSeries,
  rows: readonly CallsRow[]
): Status | null => {
  switch (beforeEight(data)) {
    case "yesterday":
      return readyOrSingle(rows.length)
    case "empty":
      return BEFORE_EIGHT_STATUS
    case null:
      return null
  }
}

/** The note above the chart before 08 with yesterday's hours (AC24). */
const leadOf = (data: MyCallSeries): { lead?: string } =>
  beforeEight(data) === "yesterday" ? { lead: BEFORE_EIGHT_NOTE } : {}

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

/** `part` per 100 of `whole`, null when either is missing (AC24). */
const ratioOrNull = (part: number | null, whole: number | null) =>
  part === null || whole === null ? null : ratio(part, whole)

/** The operator's «Risposte per operatore», in time (AC12, AC16, AC18, AC19). */
export function myCallsResult(
  input: TrendInput<MyCallSeries>
): ChartResult<CallsPoint> {
  const { data } = input
  const gap = leapDayGap(input, data.comparison)
  const compared = data.comparison !== null || gap
  const rows = callRows(input)
  const counts = callCounts(data)

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
      beforeEightStatus(data, rows) ??
      callsEmpty(input, counts.calls) ??
      readyOrSingle(rows.length),
    kpi: withGap(
      gap,
      callsKpi(counts.calls, counts.answered, counts.comparison?.calls ?? null)
    ),
    points: rows.map((r) => ({
      label: r.label,
      longLabel: r.longLabel,
      answered: r.answered,
      noAnswer: r.noAnswer,
      comparisonCalls: r.comparisonCalls,
    })),
    table: {
      columns,
      rows: rows.map((r): Cell[] => [
        r.longLabel,
        r.calls,
        r.answered,
        r.noAnswer,
        r.appointments,
        ratioOrNull(r.answered, r.calls),
        ...(compared ? [r.comparisonCalls] : []),
      ]),
    },
    notes: myCallNotes(input),
    scope: null,
    ...leadOf(data),
  }
}

/** The operator's «Tasso di appuntamento», in time (AC12, AC16, AC18, AC19, AC24). */
export function myAppointmentsResult(
  input: TrendInput<MyCallSeries>
): ChartResult<RatePoint> {
  const { data } = input
  const gap = leapDayGap(input, data.comparison)
  const compared = data.comparison !== null || gap
  const rows = callRows(input)
  const counts = callCounts(data)

  const status: Status =
    beforeEightStatus(data, rows) ??
    callsEmpty(input, counts.calls) ??
    (counts.answered === 0
      ? noAnswersStatus(input.range)
      : readyOrSingle(rows.length))

  const points = rows.map((r): RatePoint => ({
    label: r.label,
    longLabel: r.longLabel,
    rate: ratioOrNull(r.appointments, r.answered),
    comparisonRate: ratioOrNull(r.comparisonAppointments, r.comparisonAnswered),
    small: isSmall(r.answered ?? 0),
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
    kpi: withGap(
      gap,
      rateKpi(counts.appointments, counts.answered, counts.comparison)
    ),
    points,
    table: {
      columns,
      rows: rows.map((r, i): Cell[] => [
        r.longLabel,
        r.answered,
        r.appointments,
        points[i]?.rate ?? null,
        ...(compared ? [points[i]?.comparisonRate ?? null] : []),
        smallCell(r.answered ?? 0),
      ]),
    },
    notes,
    scope: null,
    ...leadOf(data),
  }
}
