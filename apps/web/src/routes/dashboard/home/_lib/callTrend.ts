import { type CallTrend } from "@mito/contract/home"
import { bucketsOf } from "@mito/domain/analytics/buckets"
import { hourLabel, hoursSpan } from "@mito/domain/analytics/hours"
import { noonOf } from "@mito/domain/utils/calendarDays"
import { plural } from "../../import/wave/_lib/text"
import { percentText } from "./today"

// The bars, rates and texts of «Andamento delle chiamate» (spec andamenti-chiamate)

export type TrendKind = "answer" | "appointment"
export type TrendChart = "calls" | "appointments"

export type TrendBar = {
  key: string
  /** Short name, for the axis */
  label: string
  /** The name of the interval in the tooltip (AC7) */
  longLabel: string
  calls: number
  answered: number
  appointments: number
  /** 0–100; `null` without calls */
  answerRate: number | null
  /** 0–100; `null` without answers */
  appointmentRate: number | null
}

export type PeriodRate = {
  rate: number | null
  numerator: number
  denominator: number
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"] as const

/** A rate 0–100, `null` when it has nothing to divide by: never 0% */
const rateOf = (numerator: number, denominator: number) =>
  denominator === 0 ? null : (numerator * 100) / denominator

type Counts = { calls: number; answered: number; appointments: number }

const bar = (
  key: string,
  label: string,
  longLabel: string,
  counts: Counts
): TrendBar => ({
  key,
  label,
  longLabel,
  ...counts,
  answerRate: rateOf(counts.answered, counts.calls),
  appointmentRate: rateOf(counts.appointments, counts.answered),
})

/** The bars in time order: hours of «Oggi», days of 7 giorni, weeks otherwise (AC5) */
export function trendBars(trend: CallTrend): TrendBar[] {
  if (trend.period === "today") {
    return (trend.hours ?? []).map((hour) => {
      const label = hourLabel(hour)
      return bar(label, label, label, hour)
    })
  }
  const byDay = new Map(trend.days.map((row) => [row.day, row]))
  const group = trend.period === "7d" ? "day" : "week"
  return bucketsOf({
    window: trend.window,
    group,
    compare: "none",
    comparison: null,
  }).map((bucket) => {
    const counts: Counts = { calls: 0, answered: 0, appointments: 0 }
    for (const day of bucket.days) {
      const row = byDay.get(day)
      if (!row) continue
      counts.calls += row.calls
      counts.answered += row.answered
      counts.appointments += row.appointments
    }
    let longLabel: string
    if (group === "day") {
      longLabel = `${WEEKDAYS[noonOf(bucket.from).getUTCDay()]} ${bucket.label}`
    } else {
      // A week cut by the window's edges says so in its name (AC7)
      longLabel =
        bucket.days.length < 7
          ? `${bucket.longLabel} (parziale)`
          : bucket.longLabel
    }
    return bar(bucket.from, bucket.label, longLabel, counts)
  })
}

/** The rate of the whole period, from the sums of the bars (AC8) */
export function periodRate(bars: TrendBar[], kind: TrendKind): PeriodRate {
  let calls = 0
  let answered = 0
  let appointments = 0
  for (const b of bars) {
    calls += b.calls
    answered += b.answered
    appointments += b.appointments
  }
  const [numerator, denominator] =
    kind === "answer" ? [answered, calls] : [appointments, answered]
  return { rate: rateOf(numerator, denominator), numerator, denominator }
}

/** «48 risposte su 150 chiamate», «4 appuntamenti su 10 risposte» */
const pairText = (numerator: number, denominator: number, kind: TrendKind) =>
  kind === "answer"
    ? `${plural(numerator, "risposta", "risposte")} su ${plural(denominator, "chiamata", "chiamate")}`
    : `${plural(numerator, "appuntamento", "appuntamenti")} su ${plural(denominator, "risposta", "risposte")}`

const emptyText = (kind: TrendKind) =>
  kind === "answer" ? "nessuna chiamata" : "nessuna risposta"

const textOf = (rate: PeriodRate, kind: TrendKind) =>
  rate.rate === null
    ? null
    : `${percentText(rate.rate / 100)} · ${pairText(rate.numerator, rate.denominator, kind)}`

/** «Mar 4 nov · 32% · 48 risposte su 150 chiamate» (AC7); a gap says why */
export function barText(b: TrendBar, kind: TrendKind): string {
  const [numerator, denominator] =
    kind === "answer" ? [b.answered, b.calls] : [b.appointments, b.answered]
  const text = textOf(
    { rate: rateOf(numerator, denominator), numerator, denominator },
    kind
  )
  return `${b.longLabel} · ${text ?? emptyText(kind)}`
}

/** «31% · 1.240 risposte su 4.000 chiamate» (AC8) */
export function periodText(rate: PeriodRate, kind: TrendKind): string {
  return (
    textOf(rate, kind) ??
    (kind === "answer" ? "Nessuna chiamata" : "Nessuna risposta")
  )
}

const GROUP_OF = {
  today: "hour",
  "7d": "day",
  "30d": "week",
  "90d": "week",
} as const

const ANALISI = "/dashboard/analisi"

/** The «Dettaglio in Analisi» link: no `compare`, so Analisi starts from its own (AC10) */
export const trendHref = (period: CallTrend["period"], chart: TrendChart) =>
  `${ANALISI}?range=${period}&group=${GROUP_OF[period]}&chart=${chart}`

export type TrendEmpty = {
  title: string
  action?: { label: string; href: string }
}

/** What replaces the charts: no calls in the period, or «Oggi» before 08 (AC11) */
export function trendEmpty(trend: CallTrend): TrendEmpty | null {
  if (trend.period === "today") {
    if ((trend.hours ?? []).length === 0) {
      return {
        title: "La giornata di lavoro inizia alle 8",
        action: {
          label: "Vedi ieri",
          href: `${ANALISI}?range=today&group=hour&compare=previous&chart=calls`,
        },
      }
    }
    const any = (trend.hours ?? []).some((hour) => hour.calls > 0)
    return any ? null : { title: "Nessuna chiamata nel periodo" }
  }
  return trend.days.some((row) => row.calls > 0)
    ? null
    : { title: "Nessuna chiamata nel periodo" }
}

/** «Oggi, 08:00–15:20» beside the selector; `null` outside «Oggi» or before 08 (AC4) */
export function todayLabel(trend: CallTrend): string | null {
  if (trend.period !== "today") return null
  const span = hoursSpan(trend.hours ?? [])
  return span === null ? null : `Oggi, ${span}`
}
