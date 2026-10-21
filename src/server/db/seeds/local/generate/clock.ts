// Instants of the contacts, alerts, notes and log, all derived from D. A day is
// given as an offset: how many days before D (negative = after D). Noon and
// midnight of Rome are computed once per offset (Intl is slow) and every call
// returns a new Date, so no two rows share a mutable object.
import { addDays, romeMidnight, romeNoon } from "../day"
import type { Day } from "../types"

const MS_PER_DAY = 86_400_000

/** Whole days from `from` to `to` (day strings, parsed as UTC midnight). */
export const daysBetween = (from: Day, to: Day) =>
  Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY)

export type DayClock = {
  /** Rome noon of the day `offset` days before D. */
  noon: (offset: number) => Date
  /** Rome midnight of the day `offset` days before D. */
  midnight: (offset: number) => Date
  /** Days between the Rome-noon instant `at` and D (both at noon). */
  offsetOf: (at: Date) => number
}

export function createDayClock(day: Day): DayClock {
  const noons = new Map<number, number>()
  const midnights = new Map<number, number>()
  const cached =
    (cache: Map<number, number>, of: (day: Day) => Date) =>
    (offset: number) => {
      let ms = cache.get(offset)
      if (ms === undefined) {
        ms = of(addDays(day, -offset)).getTime()
        cache.set(offset, ms)
      }
      return new Date(ms)
    }
  const noonOfD = romeNoon(day).getTime()
  return {
    noon: cached(noons, romeNoon),
    midnight: cached(midnights, romeMidnight),
    // A DST change in between moves the difference by one hour at most
    offsetOf: (at) => Math.round((noonOfD - at.getTime()) / MS_PER_DAY),
  }
}
