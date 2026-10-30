import { z } from "zod"
import { romeDay, romeDayBounds } from "../contact/time"
import { addDays, addMonths, isDay, noonOf } from "../utils/calendarDays"

/**
 * The period of the calls export: calendar days in Rome, `YYYY-MM-DD`, both
 * included.
 */
export type ExportPeriod = { from: string; to: string }

/** The first day the log of the contacts has every call of (it started then). */
export const COMPLETE_DATA_SINCE = "2026-09-15"

/** How many months of the contacts log the nightly cleanup keeps. */
export const LOG_RETENTION_MONTHS = 25

/**
 * The days a period can use at `now` (AC11b): from the day after the one 25
 * months ago, which the nightly cleanup may already have cut, to today.
 */
export function selectableDays(now: Date): { first: string; last: string } {
  const today = romeDay(now)
  return {
    first: addDays(addMonths(today, -LOG_RETENTION_MONTHS), 1),
    last: today,
  }
}

/**
 * The first day the calls export has complete data at `now` (AC16 of
 * pagina-analisi): the later of the day the log has every call of and the
 * first selectable day, the log keeps 25 months as the export does.
 */
export function callsCompleteSince(now: Date): string {
  const { first } = selectableDays(now)
  return COMPLETE_DATA_SINCE > first ? COMPLETE_DATA_SINCE : first
}

/** The period the export opens on: the last 30 days, today included. */
export function defaultPeriod(now: Date): ExportPeriod {
  const today = romeDay(now)
  return { from: addDays(today, -29), to: today }
}

/** The instants of a period: midnight in Rome of `from`, up to the midnight after `to` (excluded). */
export function periodBounds(period: ExportPeriod): { start: Date; end: Date } {
  return {
    start: romeDayBounds(noonOf(period.from)).start,
    end: romeDayBounds(noonOf(period.to)).end,
  }
}

/** Whether the period starts before the log has every call (AC11b). */
export const startsBeforeCompleteData = (period: ExportPeriod) =>
  period.from < COMPLETE_DATA_SINCE

/** The input of the export at `now`: two existing days, in order, inside the selectable days. */
export const exportPeriodInput = (now: Date) => {
  const { first, last } = selectableDays(now)
  return z
    .object({
      from: z.string().refine(isDay, "Not a day"),
      to: z.string().refine(isDay, "Not a day"),
    })
    .refine((period) => period.from <= period.to, "Inverted period")
    .refine(
      (period) => period.from >= first && period.to <= last,
      "Outside the selectable days"
    )
}
