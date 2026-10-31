import {
  addDays,
  addMonths,
  isDay,
  isWholeMonths,
  monthsBetween,
  noonOf,
} from "../utils/calendarDays"

/**
 * The data window of the Analysis page: calendar days in Rome written as
 * `YYYY-MM-DD`, both ends included. Nothing here reads the clock or the
 * machine time zone: `today` is always an argument.
 */
export type DayRange = { from: string; to: string }

/** The ready-made windows. */
export const PRESETS = ["7d", "30d", "90d", "ytd", "12m"] as const
export type Preset = (typeof PRESETS)[number]

/** The ready-made windows plus the dates picked by hand. */
export const RANGES = [...PRESETS, "custom"] as const
export type Range = (typeof RANGES)[number]

/** What the window is compared with. */
export const COMPARES = ["previous", "last-year", "none"] as const
export type Compare = (typeof COMPARES)[number]

/** The "group by" choices: `auto` lets the window decide. */
export const GROUPS = ["auto", "day", "week", "month"] as const
export type Group = (typeof GROUPS)[number]

/** The buckets a series can really be cut in. */
export type Bucketing = "day" | "week" | "month"

/** The longest window, in days. */
export const MAX_WINDOW_DAYS = 366

const DAY_MS = 86_400_000

/**
 * How many days the window spans, both ends included. Counted between noons
 * UTC, so the count never meets a DST change.
 */
export const daysIn = (window: DayRange) =>
  Math.round(
    (noonOf(window.to).getTime() - noonOf(window.from).getTime()) / DAY_MS
  ) + 1

/** The window a ready-made choice covers at `today` (AC9). */
export function presetRange(preset: Preset, today: string): DayRange {
  switch (preset) {
    case "7d":
      return { from: addDays(today, -6), to: today }
    case "30d":
      return { from: addDays(today, -29), to: today }
    case "90d":
      return { from: addDays(today, -89), to: today }
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case "12m":
      return { from: addDays(addMonths(today, -12), 1), to: today }
  }
}

/** The comparison a window opens with: the year before for the current year, else the previous period (AC9). */
export const initialComparison = (range: Range): Compare =>
  range === "ytd" ? "last-year" : "previous"

/**
 * The window if both ends are existing days, in order, from 1 to 366 days,
 * none after `today`; `null` otherwise (AC9). Never throws.
 */
export function validateWindow(
  range: { from: string; to: string },
  today: string
): DayRange | null {
  const { from, to } = range
  if (!isDay(from) || !isDay(to) || !isDay(today)) {
    return null
  }
  if (from > to || to > today) return null
  if (daysIn({ from, to }) > MAX_WINDOW_DAYS) return null
  return { from, to }
}

/**
 * The window to compare with (AC10). "previous": whole calendar months go
 * against as many months just before, any other window against as many days
 * just before. "last-year": the same dates a year before, each end clamped to
 * the month's end. "none": no comparison.
 */
export function comparisonOf(
  window: DayRange,
  compare: Compare
): DayRange | null {
  if (compare === "none") return null
  if (compare === "last-year") {
    return {
      from: addMonths(window.from, -12),
      to: addMonths(window.to, -12),
    }
  }
  if (isWholeMonths(window)) {
    const months = monthsBetween(window.from, window.to) + 1
    return {
      from: addMonths(window.from, -months),
      to: addDays(window.from, -1),
    }
  }
  const to = addDays(window.from, -1)
  return { from: addDays(to, -(daysIn(window) - 1)), to }
}

/** The bucket "automatic" picks: by day up to 14 days, by week up to 120, then by month (AC13). */
export const autoGroup = (days: number): Bucketing =>
  days <= 14 ? "day" : days <= 120 ? "week" : "month"

/** The choices a window of `days` days allows: by day up to 120, by week from 14, by month from 60 (AC13). */
export function allowedGroups(days: number): Group[] {
  const groups: Group[] = ["auto"]
  if (days <= 120) groups.push("day")
  if (days >= 14) groups.push("week")
  if (days >= 60) groups.push("month")
  return groups
}

/** The choice itself, or "auto" when a window change made it not allowed (AC13). */
export const effectiveGroup = (choice: Group, days: number): Group =>
  allowedGroups(days).includes(choice) ? choice : "auto"

/** The bucket a series is cut in for `choice` on a window of `days` days. */
export function resolveGroup(choice: Group, days: number): Bucketing {
  const group = effectiveGroup(choice, days)
  return group === "auto" ? autoGroup(days) : group
}

/** The wider ready-made window an empty state offers (AC15); `null` when there is none. */
export function widenAction(range: Range): Preset | null {
  switch (range) {
    case "7d":
    case "custom":
      return "30d"
    case "30d":
      return "90d"
    case "90d":
      return "12m"
    case "12m":
    case "ytd":
      return null
  }
}
