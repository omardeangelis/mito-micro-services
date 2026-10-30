import {
  addDays,
  firstOfMonth,
  isWholeMonths,
  lastOfMonth,
  monthsBetween,
  noonOf,
  parseDay,
} from "../utils/calendarDays"
import { daysIn, type Bucketing, type Compare, type DayRange } from "./window"

/**
 * The buckets of the Analysis page's chart and table (AC11): calendar days in
 * Rome written as `YYYY-MM-DD`. Nothing here reads the clock or the machine
 * time zone.
 */

/** One interval of the chart and of the table, with the days it is compared with. */
export type Bucket = {
  from: string
  to: string
  days: string[]
  /** Short name, for the chart axis ("30 ott", "1 set", "ott 26"). */
  label: string
  /** Full name, for the table ("1 – 6 set 2026", "mar 2026"). */
  longLabel: string
  /** The days of the comparison it is compared with; `null` when it isn't compared. */
  comparisonDays: string[] | null
}

const MONTHS = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
] as const

const monthName = (month: number) => MONTHS[month - 1] ?? ""

/** The number of days of `month` (1–12) in `year`. */
const monthLength = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The Monday of the week `day` is in. */
const mondayOf = (day: string) =>
  addDays(day, -((noonOf(day).getUTCDay() + 6) % 7))

/** The days from `from` to `to`, both included. */
const daysOf = (range: DayRange) =>
  Array.from({ length: daysIn(range) }, (_, i) => addDays(range.from, i))

const inRange = (day: string, range: DayRange) =>
  day >= range.from && day <= range.to

/**
 * `day` moved by `months` months to the same day of the month of arrival;
 * `null` when that month doesn't have it (the 29th, 30th or 31st).
 */
export function shiftMonths(day: string, months: number): string | null {
  const { year, month, dayOfMonth } = parseDay(day)
  const index = year * 12 + (month - 1) + months
  const toYear = Math.floor(index / 12)
  const toMonth = index - toYear * 12 + 1
  if (dayOfMonth > monthLength(toYear, toMonth)) return null
  return `${String(toYear).padStart(4, "0")}-${String(toMonth).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`
}

/**
 * A range in Italian: "30 ott 2026", "1 – 30 ott 2026",
 * "27 lug – 2 ago 2026", "31 ott 2025 – 30 ott 2026".
 */
export function formatRange(range: DayRange): string {
  const from = parseDay(range.from)
  const to = parseDay(range.to)
  const end = `${to.dayOfMonth} ${monthName(to.month)} ${to.year}`
  if (range.from === range.to) return end
  if (from.year !== to.year) {
    return `${from.dayOfMonth} ${monthName(from.month)} ${from.year} – ${end}`
  }
  if (from.month !== to.month) {
    return `${from.dayOfMonth} ${monthName(from.month)} – ${end}`
  }
  return `${from.dayOfMonth} – ${end}`
}

/** "30 ott": a day without the year. */
const shortDay = (day: string) => {
  const { dayOfMonth, month } = parseDay(day)
  return `${dayOfMonth} ${monthName(month)}`
}

/** How the dates of a bucket move back to the comparison (AC11). */
type Shift = { months: number } | { days: number }

function shiftOf(
  window: DayRange,
  group: Bucketing,
  compare: Compare,
  comparison: DayRange
): Shift {
  if (group === "month") {
    return { months: monthsBetween(comparison.from, window.from) }
  }
  if (compare === "last-year") return { months: 12 }
  if (compare === "previous" && isWholeMonths(window)) {
    return { months: monthsBetween(window.from, window.to) + 1 }
  }
  return { days: daysIn({ from: comparison.from, to: window.from }) - 1 }
}

/** The days a bucket is compared with, or `null` when it isn't compared (AC11). */
function comparisonDaysOf(
  bucket: DayRange & { days: string[]; wholeMonth: boolean },
  shift: Shift,
  comparison: DayRange
): string[] | null {
  if (bucket.wholeMonth && "months" in shift) {
    // Day 1 exists in every month
    const first = shiftMonths(bucket.from, -shift.months) ?? bucket.from
    const month = { from: first, to: lastOfMonth(first) }
    const contained =
      inRange(month.from, comparison) && inRange(month.to, comparison)
    return contained ? daysOf(month) : null
  }
  const moved = bucket.days.flatMap((day) => {
    const to =
      "months" in shift
        ? shiftMonths(day, -shift.months)
        : addDays(day, -shift.days)
    return to !== null && inRange(to, comparison) ? [to] : []
  })
  return moved.length === bucket.days.length ? moved : null
}

/**
 * The window cut in buckets, in time order (AC11): days, weeks from Monday or
 * calendar months, the first and the last cut by the window's edges. Each
 * bucket carries the days of `comparison` it is compared with.
 */
export function bucketsOf(input: {
  window: DayRange
  group: Bucketing
  compare: Compare
  comparison: DayRange | null
}): Bucket[] {
  const { window, group, compare, comparison } = input
  const startOf = (day: string) =>
    group === "day" ? day : group === "week" ? mondayOf(day) : firstOfMonth(day)

  const ranges: Array<DayRange & { days: string[]; wholeMonth: boolean }> = []
  for (const day of daysOf(window)) {
    const last = ranges[ranges.length - 1]
    if (last && startOf(last.from) === startOf(day)) {
      last.to = day
      last.days.push(day)
    } else {
      ranges.push({ from: day, to: day, days: [day], wholeMonth: false })
    }
  }
  for (const range of ranges) {
    range.wholeMonth = group === "month" && isWholeMonths(range)
  }

  const shift =
    compare === "none" || comparison === null
      ? null
      : shiftOf(window, group, compare, comparison)

  return ranges.map((range) => {
    const { year, month } = parseDay(range.from)
    const label =
      group === "month" && range.wholeMonth
        ? `${monthName(month)} ${String(year).slice(-2)}`
        : shortDay(range.from)
    const longLabel = range.wholeMonth
      ? `${monthName(month)} ${year}`
      : formatRange(range)
    return {
      from: range.from,
      to: range.to,
      days: range.days,
      label,
      longLabel,
      comparisonDays:
        shift === null || comparison === null
          ? null
          : comparisonDaysOf(range, shift, comparison),
    }
  })
}

/** The sum of `pick(row)` over the rows whose day is in `days`. */
export function sumDays<T extends { day: string }>(
  days: readonly string[],
  rows: readonly T[],
  pick: (row: T) => number
): number {
  const wanted = new Set(days)
  let total = 0
  for (const row of rows) {
    if (wanted.has(row.day)) total += pick(row)
  }
  return total
}
