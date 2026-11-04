// The days of the Wave page (spec assegnazione-wave, AC6, AC20, AC21). A day is
// a `YYYY-MM-DD` string of Rome; the arithmetic is on UTC midnights, so it
// never depends on the time zone of the process or on daylight saving.

export type Day = string

const MS_PER_DAY = 86_400_000

const romeDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const pad = (n: number) => String(n).padStart(2, "0")

const toMs = (day: Day) => {
  const [y, m, d] = day.split("-").map(Number)
  return Date.UTC(y!, m! - 1, d)
}

const fromMs = (ms: number): Day => {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** «Oggi» in Rome, from an instant */
export function romeToday(now: Date): Day {
  const parts = romeDay.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** `day` moved by `n` calendar days */
export const addDays = (day: Day, n: number): Day =>
  fromMs(toMs(day) + n * MS_PER_DAY)

/** Calendar days from `day` to `today` */
export const daysSince = (day: Day, today: Day): number =>
  Math.round((toMs(today) - toMs(day)) / MS_PER_DAY)

/**
 * Working days from tomorrow to `deadline` included: Monday to Friday,
 * holidays count as working days.
 */
export function workdaysLeft(today: Day, deadline: Day): number {
  const days = daysSince(today, deadline)
  let count = 0
  const start = toMs(today)
  for (let i = 1; i <= days; i++) {
    const weekday = new Date(start + i * MS_PER_DAY).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

/** The deadline proposed for a Wave: today + 30 days */
export const proposeDeadline = (today: Day): Day => addDays(today, 30)

export type Shortcut = {
  readonly label: string
  readonly day: Day
  readonly disabled: boolean
}

const endOfMonth = (day: Day): Day => {
  const [y, m] = day.split("-").map(Number)
  return fromMs(Date.UTC(y!, m, 0))
}

/** The shortcuts of the date button, off when they fall before `min` */
export function shortcuts(today: Day, min: Day): Shortcut[] {
  return [
    { label: "+14 giorni", day: addDays(today, 14) },
    { label: "+30 giorni", day: addDays(today, 30) },
    { label: "+45 giorni", day: addDays(today, 45) },
    { label: "Fine mese", day: endOfMonth(today) },
  ].map((s) => ({ ...s, disabled: s.day < min }))
}

/** Where the new deadline of «Proroga» starts: the later of today + 14 and the day after the deadline */
export function extendStart(today: Day, deadline: Day): Day {
  const a = addDays(today, 14)
  const b = addDays(deadline, 1)
  return a > b ? a : b
}
