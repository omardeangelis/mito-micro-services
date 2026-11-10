import { romeAt, romeDay, romeTime } from "../contact/time"
import { addDays, addMonths, parseDay } from "../utils/calendarDays"
import type { Compare } from "./window"

/**
 * The hours of the "Today" period (AC18-AC26): whole Rome hours of the working
 * day, half-open `[start, end)`. Nothing here reads the clock or the machine
 * time zone: `now` is always an argument.
 */

/** The working day in Rome: from 08:00 to 19:00, every day. */
export const WORK_HOURS = { start: 8, end: 19 } as const

/** The most hours "Today" shows. */
export const MAX_TODAY_HOURS = 8

/** One hour slot; the hour in progress ends at `now`. */
export type HourSlot = { start: Date; end: Date; inProgress: boolean }

/** The Rome hour (0-23) of an instant. */
const hourOf = (instant: Date) => Number(romeTime(instant).slice(0, 2))

/**
 * The hours of today already started, the last `MAX_TODAY_HOURS` at most. The
 * one started and not ended is in progress and ends at `now`; none before 08.
 */
export function todayHours(now: Date): HourSlot[] {
  const day = romeDay(now)
  const slots: HourSlot[] = []
  for (let hour = WORK_HOURS.start; hour < WORK_HOURS.end; hour++) {
    const start = romeAt(day, hour)
    const end = romeAt(day, hour + 1)
    if (now.getTime() < start.getTime()) break
    const inProgress = now.getTime() < end.getTime()
    slots.push({ start, end: inProgress ? now : end, inProgress })
  }
  return slots.slice(-MAX_TODAY_HOURS)
}

/**
 * The slots each of `slots` is compared with (AC20, AC24), same wall-clock
 * hours of another day, built from the calendar day (never by subtracting 24
 * hours). Comparison slots copy `inProgress` from their source slot: the one
 * in progress ends at the same minutes (and seconds) as `now`.
 * - `none`: `null`.
 * - `previous`: yesterday. With no `slots` (before 08) the last
 *   `MAX_TODAY_HOURS` whole hours of yesterday's working day.
 * - `last-year`: the same day a year before; `null` on 29 February, `[]` when
 *   there are no `slots`.
 */
export function comparisonHours(
  slots: readonly HourSlot[],
  compare: Compare,
  now: Date
): HourSlot[] | null {
  if (compare === "none") return null
  const today = romeDay(now)
  let day: string
  if (compare === "previous") {
    day = addDays(today, -1)
  } else {
    const { month, dayOfMonth } = parseDay(today)
    if (month === 2 && dayOfMonth === 29) return null
    day = addMonths(today, -12)
  }
  if (slots.length === 0) {
    if (compare === "last-year") return []
    const hours = Array.from(
      { length: MAX_TODAY_HOURS },
      (_, i) => WORK_HOURS.end - MAX_TODAY_HOURS + i
    )
    return hours.map((hour) => ({
      start: romeAt(day, hour),
      end: romeAt(day, hour + 1),
      inProgress: false,
    }))
  }
  return slots.map((slot) => {
    const hour = hourOf(slot.start)
    if (!slot.inProgress) {
      return {
        start: romeAt(day, hour),
        end: romeAt(day, hour + 1),
        inProgress: false,
      }
    }
    const [h = 0, m = 0] = romeTime(now).split(":").map(Number)
    const sub = ((now.getTime() % 60_000) + 60_000) % 60_000
    return {
      start: romeAt(day, hour),
      end: new Date(romeAt(day, h, m).getTime() + sub),
      inProgress: true,
    }
  })
}

/** "15:00–16:00"; the one in progress "15:00–15:20 (in corso)". */
export function hourLabel(slot: HourSlot): string {
  const label = `${romeTime(slot.start)}–${romeTime(slot.end)}`
  return slot.inProgress ? `${label} (in corso)` : label
}

/** "08:00–15:20": from the first start to the last end; `null` when empty. */
export function hoursSpan(slots: readonly HourSlot[]): string | null {
  const first = slots[0]
  const last = slots[slots.length - 1]
  if (!first || !last) return null
  return `${romeTime(first.start)}–${romeTime(last.end)}`
}
