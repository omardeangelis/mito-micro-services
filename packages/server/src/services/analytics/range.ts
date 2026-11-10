import { Clock, Effect } from "effect"
import { InvalidWindow } from "@mito/contract/errors"
import {
  comparisonHours,
  todayHours,
  type HourSlot,
} from "@mito/domain/analytics/hours"
import {
  comparisonOf,
  validateWindow,
  type Compare,
  type DayRange,
} from "@mito/domain/analytics/window"
import { romeDay } from "@mito/domain/contact/time"
import { addDays } from "@mito/domain/utils/calendarDays"

/**
 * The window of the analysis page and its comparison (AC10), both as Rome
 * days, both ends included; `comparison` is `null` for "none". With «Oggi»
 * also its hours and the ones they are compared with (AC20, AC24); `null`
 * otherwise.
 */
export type AnalysisRange = {
  window: DayRange
  comparison: DayRange | null
  hours: HourSlot[] | null
  comparisonHours: HourSlot[] | null
}

/**
 * «Oggi» at `now` (AC18, AC20, AC22): today in Rome as the window, whatever
 * `from` and `to` say. On 29 February the year before has no such day: no
 * comparison, for the hours as for the day.
 */
const todayRange = (now: Date, compare: Compare): AnalysisRange => {
  const today = romeDay(now)
  const window = { from: today, to: today }
  const hours = todayHours(now)
  // `comparisonHours` is null with "none", and with the year before on 29
  // February: the day has no comparison either
  const compared = comparisonHours(hours, compare, now)
  return {
    window,
    comparison: compared === null ? null : comparisonOf(window, compare),
    hours,
    comparisonHours: compared,
  }
}

/**
 * The window the query asks for, checked against today in Rome (from the
 * server's `Clock` at every run) and ready for the queries (AC14, D7): a
 * `to` one day after today is shortened to today, as a browser a few hours
 * ahead of the server may send it, and the comparison is computed on the
 * shortened window. A window that isn't two existing days in order, from 1
 * to 366 days, with `to` no later than tomorrow, fails with `InvalidWindow`.
 * With `range` «Oggi» (`todayRange`).
 */
export const analysisRange = Effect.fn("analytics.analysisRange")(function* ({
  from,
  to,
  compare,
  range,
}: {
  from: string
  to: string
  compare: Compare
  range?: "today" | undefined
}) {
  const now = new Date(yield* Clock.currentTimeMillis)
  if (range === "today") return todayRange(now, compare)
  const today = romeDay(now)
  const shortened = to === addDays(today, 1) ? today : to
  const window = validateWindow({ from, to: shortened }, today)
  if (window === null) return yield* new InvalidWindow()
  return {
    window,
    comparison: comparisonOf(window, compare),
    hours: null,
    comparisonHours: null,
  } satisfies AnalysisRange
})

/**
 * Runs `run` on the window and on its comparison at once, and gives both
 * results; `empty` stands for the comparison when there is none.
 */
export const withComparison = <A, B, E, R>(
  range: Pick<AnalysisRange, "window" | "comparison">,
  empty: B,
  run: (window: DayRange) => Effect.Effect<A, E, R>
) =>
  Effect.all(
    [
      run(range.window),
      range.comparison === null ? Effect.succeed(empty) : run(range.comparison),
    ],
    { concurrency: "unbounded" }
  )
