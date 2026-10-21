// Calendar days in Europe/Rome, the time zone the users and the cron work in.
// Pure: nothing here reads the time zone of the process.

const romeClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** The Rome wall clock of an instant: its day as `YYYY-MM-DD`, its time as `HH:mm`. */
function romeWallClock(instant: Date) {
  const parts = romeClock.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  }
}

/** The Rome calendar day of an instant, as `YYYY-MM-DD`. */
const romeDay = (instant: Date) => romeWallClock(instant).day

/** True when the Rome day of `date` is strictly before the Rome day of `now`. */
export const isPastDay = (date: Date, now: Date): boolean =>
  romeDay(date) < romeDay(now)

/** True when the Rome day of `deadline` is today (the Rome day of `now`) or earlier. */
export const isDueOrOverdue = (deadline: Date, now: Date): boolean =>
  romeDay(deadline) <= romeDay(now)

const HOUR = 60 * 60 * 1000

/** The year, month (1-12) and day of a `YYYY-MM-DD` string. */
function dayParts(day: string) {
  const [year = 0, month = 1, dayOfMonth = 1] = day.split("-").map(Number)
  return { year, month, dayOfMonth }
}

/** The instant of 00:00 in Rome on the calendar day `day` (`YYYY-MM-DD`). */
function romeMidnight(day: string): Date {
  const { year, month, dayOfMonth } = dayParts(day)
  const utcMidnight = Date.UTC(year, month - 1, dayOfMonth)
  // Rome is UTC+1 in winter and UTC+2 in summer time: the midnight is the
  // candidate whose Rome wall clock reads 00:00 of that day.
  const winter = new Date(utcMidnight - HOUR)
  const wall = romeWallClock(winter)
  if (wall.day === day && wall.time === "00:00") return winter
  return new Date(utcMidnight - 2 * HOUR)
}

/**
 * The Rome calendar day that contains `date`: `start` is its midnight in Rome,
 * `end` the midnight that starts the next day (exclusive). A day with a clock
 * change lasts 23 or 25 hours.
 */
export function romeDayBounds(date: Date): { start: Date; end: Date } {
  const day = romeDay(date)
  const { year, month, dayOfMonth } = dayParts(day)
  const nextDay = new Date(Date.UTC(year, month - 1, dayOfMonth + 1))
    .toISOString()
    .slice(0, 10)
  return { start: romeMidnight(day), end: romeMidnight(nextDay) }
}
