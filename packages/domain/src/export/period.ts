import { z } from "zod"
import { romeDay, romeDayBounds } from "../contact/time"

/**
 * The period of the calls export: calendar days in Rome, `YYYY-MM-DD`, both
 * included.
 */
export type ExportPeriod = { from: string; to: string }

/** The first day the log of the contacts has every call of (it started then). */
export const COMPLETE_DATA_SINCE = "2026-09-15"

/** How many months of the contacts log the nightly cleanup keeps. */
export const LOG_RETENTION_MONTHS = 3

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Noon UTC of a `YYYY-MM-DD` day: an instant in the same Rome day. */
const noonOf = (day: string) => new Date(`${day}T12:00:00.000Z`)

/** Whether `day` is a `YYYY-MM-DD` day that exists in the calendar. */
const isDay = (day: string) =>
  DAY.test(day) && noonOf(day).toISOString().slice(0, 10) === day

/** `day` shifted by `months` months, clamped to the last day of the month. */
function addMonths(day: string, months: number): string {
  const [year = 0, month = 1, dayOfMonth = 1] = day.split("-").map(Number)
  const firstOfMonth = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)
  ).getUTCDate()
  firstOfMonth.setUTCDate(Math.min(dayOfMonth, lastDay))
  return firstOfMonth.toISOString().slice(0, 10)
}

const addDays = (day: string, days: number) => {
  const date = noonOf(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The days a period can use at `now` (AC11b): from the day after the one 3
 * months ago, which the nightly cleanup may already have cut, to today.
 */
export function selectableDays(now: Date): { first: string; last: string } {
  const today = romeDay(now)
  return {
    first: addDays(addMonths(today, -LOG_RETENTION_MONTHS), 1),
    last: today,
  }
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
