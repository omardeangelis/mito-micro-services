import {
  type Preset,
  type Range,
  widenAction,
} from "@mito/domain/analytics/window"
import type { ChartId } from "./charts"

/**
 * What every chart of the Analysis page turns its answer into: the indicator
 * tab, the chart, the table under it and the exported files all read the same
 * `ChartResult`. No React here.
 */

/** The action of an empty or number-only state (AC15, AC19). */
export type Action = { label: string; range: Preset }

/** The state of a chart that has its data (AC19); loading and error belong to the page. */
export type Status =
  | { kind: "ready" }
  | { kind: "empty"; title: string; reason: string; action: Action | null }
  | { kind: "kpiOnly"; title: string; reason: string; action: Action | null }

/** A cell of the table: `null` is shown and exported as «—» (AC24). */
export type Cell = string | number | null

export type ColumnFormat = "text" | "euro" | "count" | "percent"

export type Column = { header: string; format: ColumnFormat }

/** The table under the chart; percent cells hold numbers from 0 to 100. */
export type Table = { columns: Column[]; rows: Cell[][] }

/** The variation of the number on the comparison (AC12). */
export type Delta =
  /** Amounts, counts and the mean, in percent */
  | { kind: "percent"; value: number }
  /** Rates, in percentage points */
  | { kind: "points"; value: number }
  /** «—», with the note that says why */
  | { kind: "none"; note: string }

/** The number of the chart; `delta` is null when nothing is compared. */
export type Kpi = {
  value: number | null
  format: "euro" | "count" | "percent"
  caption: string
  delta: Delta | null
}

export type ChartResult<P> = {
  id: ChartId
  title: string
  /** The question under the title */
  question: string
  status: Status
  kpi: Kpi
  /** The points of the chart, in time order for the charts in time */
  points: P[]
  table: Table
  /** The notes under the chart, also written in the files */
  notes: string[]
  /** The line above the chart that says whose numbers they are (AC6); null for all of them */
  scope: string | null
}

/** The titles of the charts (AC3). */
export const CHART_TITLES: Record<ChartId, string> = {
  financed: "Finanziato totale",
  average: "Finanziato medio per pratica",
  branches: "Finanziato per sede",
  progress: "Contatti con esito",
  calls: "Risposte per operatore",
  appointments: "Tasso di appuntamento",
}

/** The questions under the titles (AC3); the operator's call charts have their own (AC18). */
export const CHART_QUESTIONS: Record<ChartId, string> = {
  financed:
    "Quanto è stato liquidato nella finestra, e com'è andata rispetto al confronto?",
  average: "Il valore della singola pratica sale o scende?",
  branches: "Quali sedi portano il finanziato, e quanto pesa ciascuna?",
  progress: "Quanta parte della coda ha già un esito?",
  calls: "Quante chiamate fa ognuno, e quante trovano risposta?",
  appointments: "Su cento risposte, quanti appuntamenti?",
}

/** What a missing value shows (AC24). */
export const DASH = "—"

/**
 * Italian numbers with the thousands always grouped: `it-IT` alone writes
 * "3725", the page writes "3.725".
 */
const numberFormat = (fractionDigits: number) =>
  new Intl.NumberFormat("it-IT", {
    useGrouping: true,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

const whole = numberFormat(0)
const oneDecimal = numberFormat(1)
const twoDecimals = numberFormat(2)

/** "-0" never shows: a value that rounds to zero is zero. */
const noNegativeZero = (value: number) => (Object.is(value, -0) ? 0 : value)

/** An amount without the sign: "12.500", "12.500,50". */
const euroDigits = (value: number) =>
  Number.isInteger(value) ? whole.format(value) : twoDecimals.format(value)

/** A rate with one decimal, always (AC41): "54,0%". */
const percent = (value: number) =>
  `${oneDecimal.format(noNegativeZero(Math.round(value * 10) / 10))}%`

/** A cell as the table shows it: «—» for null (AC24), Italian numbers, no € sign. */
export function formatCell(cell: Cell, format: ColumnFormat): string {
  if (cell === null) return DASH
  if (typeof cell === "string") return cell
  switch (format) {
    case "text":
      return String(cell)
    case "euro":
      return euroDigits(cell)
    case "count":
      return whole.format(cell)
    case "percent":
      return percent(cell)
  }
}

/** The variation as the number shows it: "+4%", "-3,2 punti", «—»; "" with no comparison. */
export function formatDelta(delta: Delta | null): string {
  if (delta === null) return ""
  if (delta.kind === "none") return DASH
  if (delta.kind === "percent") {
    const rounded = noNegativeZero(Math.round(delta.value))
    return `${rounded > 0 ? "+" : ""}${whole.format(rounded)}%`
  }
  const rounded = noNegativeZero(Math.round(delta.value * 10) / 10)
  return `${rounded > 0 ? "+" : ""}${oneDecimal.format(rounded)} punti`
}

/** The number of a chart: "14.000 €", "3.725", "57,0%", «—» without data (AC24). */
export function formatKpi(kpi: Kpi): string {
  if (kpi.value === null) return DASH
  switch (kpi.format) {
    case "euro":
      return `${whole.format(Math.round(kpi.value))} €`
    case "count":
      return whole.format(kpi.value)
    case "percent":
      return percent(kpi.value)
  }
}

/** A whole number with the thousands grouped, for captions: "3.725". */
export const formatCount = (value: number) => whole.format(value)

// --- Helpers the charts share ------------------------------------------------

const ZERO_COMPARISON = "Il confronto è a zero: la variazione non si calcola"
export const NO_DATA_COMPARISON =
  "Il confronto non ha dati: la variazione non si calcola"

/** The wider window an empty state offers (AC15); null from 12 months or the current year. */
export function widen(range: Range): Action | null {
  const next = widenAction(range)
  switch (next) {
    case "30d":
      return { label: "Allarga a 30 giorni", range: next }
    case "90d":
      return { label: "Allarga a 90 giorni", range: next }
    case "12m":
      return { label: "Allarga a 12 mesi", range: next }
    default:
      return null
  }
}

/** The change of an amount or a count, in percent (AC12). */
export const percentChange = (current: number, comparison: number): Delta =>
  comparison === 0
    ? { kind: "none", note: ZERO_COMPARISON }
    : { kind: "percent", value: ((current - comparison) / comparison) * 100 }

/** `count` with the singular or the plural: "1 pratica", "3.725 chiamate". */
export const counted = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`

/** "15/09/2026" from "2026-09-15". */
export const italianDate = (day: string) => {
  const [year, month, dayOfMonth] = day.split("-")
  return `${dayOfMonth}/${month}/${year}`
}

export const sum = <T>(rows: readonly T[], pick: (row: T) => number) =>
  rows.reduce((total, row) => total + pick(row), 0)

/** `part` per 100 of `whole`; null without a whole (AC24). */
export const ratio = (part: number, whole: number) =>
  whole === 0 ? null : (part / whole) * 100
