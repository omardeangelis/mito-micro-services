/**
 * Calendar days written as `YYYY-MM-DD`, computed at noon UTC so that no
 * result depends on the time zone of the machine. No zod here: the browser
 * imports it (@mito/domain/analytics)
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Noon UTC of a `YYYY-MM-DD` day: an instant in the same Rome day. */
export const noonOf = (day: string) => new Date(`${day}T12:00:00.000Z`)

/**
 * Whether `day` is a `YYYY-MM-DD` day that exists in the calendar, from the
 * year 1000: `Date.UTC` reads a year from 0 to 99 as 1900 to 1999, so a day
 * like "0050-03-01" would be shifted to 1950.
 */
export const isDay = (day: string) => {
  if (!DAY.test(day) || day < "1000-01-01") return false
  // "2026-13-45" matches the pattern but is no date: toISOString would throw
  const noon = noonOf(day)
  return (
    !Number.isNaN(noon.getTime()) && noon.toISOString().slice(0, 10) === day
  )
}

/** The year, the month (1–12) and the day of the month of a `YYYY-MM-DD` day. */
export const parseDay = (day: string) => {
  const [year = 0, month = 1, dayOfMonth = 1] = day.split("-").map(Number)
  return { year, month, dayOfMonth }
}

/** The first day of the month `day` is in. */
export const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`

/** The last day of the month `day` is in. */
export const lastOfMonth = (day: string) => {
  const { year, month } = parseDay(day)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${day.slice(0, 8)}${String(lastDay).padStart(2, "0")}`
}

/** How many months separate the month of `from` from the month of `to`. */
export const monthsBetween = (from: string, to: string) => {
  const a = parseDay(from)
  const b = parseDay(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/** Whether the range goes from the first to the last day of whole months. */
export const isWholeMonths = ({ from, to }: { from: string; to: string }) =>
  from === firstOfMonth(from) && to === lastOfMonth(to)

/** `day` shifted by `months` months, clamped to the last day of the month. */
export function addMonths(day: string, months: number): string {
  const { year, month, dayOfMonth } = parseDay(day)
  const first = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate()
  first.setUTCDate(Math.min(dayOfMonth, lastDay))
  return first.toISOString().slice(0, 10)
}

/** `day` shifted by `days` days (negative goes back). */
export const addDays = (day: string, days: number) => {
  const date = noonOf(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
