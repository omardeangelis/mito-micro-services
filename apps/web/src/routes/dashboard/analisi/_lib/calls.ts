import type { Role } from "@mito/contract/schemas"
import type {
  Compare,
  DayRange,
  Group,
  Range,
} from "@mito/domain/analytics/window"
import {
  counted,
  type Delta,
  italianDate,
  type Kpi,
  NO_DATA_COMPARISON,
  percentChange,
  ratio,
  type Status,
  widen,
} from "./results"

/**
 * What every chart that reads calls shares, the operator's (in time) and the
 * admin's (a ranking): the input of the builders, the small sample, the KPI
 * captions, the note on the complete data and the empty states (AC16, AC18,
 * AC19, AC25). No React here.
 */

/** What every chart is built from. */
export type TrendInput<D> = {
  data: D
  range: Range
  /** The comparison of the query that gave `data` */
  compare: Compare
  group: Group
  role: Role
  /** The first Rome day with complete call data (`callsCompleteSince`, AC16) */
  completeSince: string
}

/** Below this many answers a rate says little (AC18, AC25). */
const SMALL_SAMPLE = 15

/** Fewer than 15 answers, but some: without answers the rate is already «—» (AC18, AC24). */
export const isSmall = (answered: number) =>
  answered > 0 && answered < SMALL_SAMPLE

/** Fewer than 15 answers, none included: the rankings put these samples last (AC25). */
export const underSample = (answered: number) => answered < SMALL_SAMPLE

/** The note under a chart with a small sample. */
export const SMALL_SAMPLE_NOTE = `Meno di ${SMALL_SAMPLE} risposte: tasso poco affidabile`

/** "sì" only for a small sample; with no answers the rate is «—» and the cell empty. */
export const smallCell = (answered: number) => (isSmall(answered) ? "sì" : "")

/** The note when the window or its comparison starts before the complete data (AC16). */
function completeDataNote(
  window: DayRange,
  comparison: DayRange | null,
  completeSince: string
): string | null {
  const startsBefore =
    window.from < completeSince ||
    (comparison !== null && comparison.from < completeSince)
  return startsBefore
    ? `Dati delle chiamate completi dal ${italianDate(completeSince)}`
    : null
}

/**
 * The notes of a call chart: since when the data is complete, if the window
 * starts before it, then the `extra` ones (AC16).
 */
export const callNotes = (
  window: DayRange,
  comparison: DayRange | null,
  completeSince: string,
  ...extra: string[]
): string[] => {
  const complete = completeDataNote(window, comparison, completeSince)
  return [...(complete === null ? [] : [complete]), ...extra]
}

/**
 * The number of the call charts: the calls, with the share that found an
 * answer; the variation is on the calls (AC2, AC12). `comparisonCalls` is
 * null when nothing is compared.
 */
export function callsKpi(
  calls: number,
  answered: number,
  comparisonCalls: number | null
): Kpi {
  const answeredShare = ratio(answered, calls)
  const unit = calls === 1 ? "chiamata" : "chiamate"
  return {
    value: calls,
    format: "count",
    // The page prints the number first: «3.725» + «chiamate · 57% con risposta» (AC2)
    caption:
      answeredShare === null
        ? unit
        : `${unit} · ${Math.round(answeredShare)}% con risposta`,
    delta:
      comparisonCalls === null ? null : percentChange(calls, comparisonCalls),
  }
}

/**
 * The number of the appointment charts: appointments per 100 answers, its
 * variation in points (AC12, AC24). `comparison` is null when nothing is
 * compared.
 */
export function rateKpi(
  appointments: number,
  answered: number,
  comparison: { appointments: number; answered: number } | null
): Kpi {
  const rate = ratio(appointments, answered)
  const delta = (): Delta | null => {
    if (comparison === null) return null
    // Without answers in the window the empty state explains it: no note (AC12, AC19)
    if (rate === null) return null
    const comparisonRate = ratio(comparison.appointments, comparison.answered)
    // 0% is a value: only a rate that can't be computed has no variation (AC12)
    if (comparisonRate === null) {
      return { kind: "none", note: NO_DATA_COMPARISON }
    }
    return { kind: "points", value: rate - comparisonRate }
  }
  return {
    value: rate,
    format: "percent",
    caption: `${counted(appointments, "appuntamento", "appuntamenti")} su ${counted(answered, "risposta", "risposte")}`,
    delta: delta(),
  }
}

/** The empty state of the appointment charts without answers (AC19, AC24). */
export const noAnswersStatus = (range: Range): Status => ({
  kind: "empty",
  title: "Nessuna risposta, nessun tasso",
  reason: "Il tasso è appuntamenti su risposte: senza risposte non si calcola.",
  action: widen(range),
})

/**
 * The empty state of the call charts, or null: a window that ends before the
 * complete data comes first (AC16), then a window without calls (AC19).
 * `noCallsReason` is the reason of the second case: it says whose calls.
 */
export function callsEmptyStatus(
  input: {
    data: { window: DayRange }
    completeSince: string
    range: Range
  },
  calls: number,
  noCallsReason: string
): Status | null {
  const { completeSince, range } = input
  if (input.data.window.to < completeSince) {
    return {
      kind: "empty",
      title: "Nessuna chiamata registrata in questa finestra",
      reason: `Le chiamate sono registrate per intero dal ${italianDate(completeSince)}: questa finestra finisce prima.`,
      action: widen(range),
    }
  }
  if (calls === 0) {
    return {
      kind: "empty",
      title: "Nessuna chiamata nella finestra",
      reason: noCallsReason,
      action: widen(range),
    }
  }
  return null
}
