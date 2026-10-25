// The wall clock of Europe/Rome, without reading the time zone of the
// process: everything goes through Intl with timeZone "Europe/Rome" or UTC
// getters on shifted instants. The import uses it to give, in any process, the
// dates a browser in Rome gives (AC33).

const ROME = "Europe/Rome"
const MS_PER_DAY = 86_400_000

const romeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ROME,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
})

/** Offset of Europe/Rome from UTC (ms) at the instant, as Intl gives it. */
function formattedOffsetMs(instantMs: number): number {
  const parts = romeFormat.formatToParts(new Date(instantMs))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  )
  const wholeSecond = instantMs - (((instantMs % 1000) + 1000) % 1000)
  return wall - wholeSecond
}

// Intl is slow, and an import asks the offset of the same days for every row
// (T13): the offset of a UTC day whose first and last second agree holds for
// the whole day, so it is asked once. A day that changes offset (null) is asked
// at each instant. The size bound keeps a long process from growing it.
const offsetByDay = new Map<number, number | null>()
const MAX_CACHED_DAYS = 100_000

/** Offset of Europe/Rome from UTC (ms) at the instant. */
export function romeOffsetMs(instantMs: number): number {
  const day = Math.floor(instantMs / MS_PER_DAY)
  let offset = offsetByDay.get(day)
  if (offset === undefined) {
    const start = day * MS_PER_DAY
    const first = formattedOffsetMs(start)
    offset =
      first === formattedOffsetMs(start + MS_PER_DAY - 1000) ? first : null
    if (offsetByDay.size >= MAX_CACHED_DAYS) offsetByDay.clear()
    offsetByDay.set(day, offset)
  }
  return offset ?? formattedOffsetMs(instantMs)
}

export type WallClock = {
  year: number
  /** 0-11, as Date */
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
  ms: number
}

/** The Rome calendar fields of an instant. */
export function romeWallClock(instantMs: number): WallClock {
  const w = new Date(instantMs + romeOffsetMs(instantMs))
  return {
    year: w.getUTCFullYear(),
    month: w.getUTCMonth(),
    day: w.getUTCDate(),
    hours: w.getUTCHours(),
    minutes: w.getUTCMinutes(),
    seconds: w.getUTCSeconds(),
    ms: w.getUTCMilliseconds(),
  }
}

/**
 * The instant of a Rome wall clock, given as the "UTC" ms of its fields (also
 * with overflow, as `Date.UTC`). As a local `Date`: a time that doesn't exist
 * (clocks forward) takes the offset before the change, a time that happens
 * twice (clocks back) its first occurrence.
 */
export function romeWallToInstant(wallAsUtcMs: number): number {
  const before = romeOffsetMs(wallAsUtcMs - MS_PER_DAY)
  const after = romeOffsetMs(wallAsUtcMs + MS_PER_DAY)
  if (before === after) return wallAsUtcMs - before
  const candidates = [before, after]
    .map((offset) => wallAsUtcMs - offset)
    .filter((instant, i) => romeOffsetMs(instant) === [before, after][i])
  if (candidates.length === 0) return wallAsUtcMs - before
  return Math.min(...candidates)
}

const fromWall = (wallAsUtcMs: number) =>
  Number.isFinite(wallAsUtcMs)
    ? new Date(romeWallToInstant(wallAsUtcMs))
    : new Date(NaN)

/**
 * `new Date(year, monthIndex, day, …)` of a browser in Rome. Overflowing fields
 * roll over and years 0-99 are 1900-1999, as in the local constructor.
 */
export function romeLocalDate(
  year: number,
  monthIndex: number,
  day = 1,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0
): Date {
  return fromWall(Date.UTC(year, monthIndex, day, hours, minutes, seconds, ms))
}

/**
 * `date.setMonth(date.getMonth() + 1)` of a browser in Rome, on a copy: same
 * day of the month and time, a day the next month lacks rolls over (31
 * January → 3 March).
 */
export function addRomeMonth(date: Date): Date {
  const instant = date.getTime()
  if (Number.isNaN(instant)) return new Date(NaN)
  const w = romeWallClock(instant)
  return fromWall(
    Date.UTC(w.year, w.month + 1, w.day, w.hours, w.minutes, w.seconds, w.ms)
  )
}

// What `Date.parse` reads as an absolute instant: an ISO date without a time
// (UTC by the spec), or a time followed by Z or an offset, or a GMT/UTC zone.
// Every other text it reads in the local time zone.
const ISO_DATE_ONLY = /^[+-]?\d{4,6}(?:-\d{2}(?:-\d{2})?)?$/
const ZONED =
  /\d:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})|\b(?:UTC?|GMT)\b/i

/**
 * `new Date(value)` of a browser in Rome: a text without a time zone is read on
 * Rome's wall clock, whatever the time zone of the process. Assumes the
 * process has no clock change of its own at that wall time (UTC, or Rome).
 */
export function romeParseDate(value: string | number | boolean | Date): Date {
  const parsed = new Date(value as string)
  if (typeof value !== "string" || Number.isNaN(parsed.getTime())) return parsed
  const text = value.trim()
  if (ISO_DATE_ONLY.test(text) || ZONED.test(text)) return parsed
  return romeLocalDate(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
    parsed.getMilliseconds()
  )
}
