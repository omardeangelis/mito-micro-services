import { Clock, Effect } from "effect"
import { InvalidWindow } from "@mito/contract/errors"
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
 * days, both ends included; `comparison` is `null` for "none".
 */
export type AnalysisRange = {
  window: DayRange
  comparison: DayRange | null
}

/**
 * The window the query asks for, checked against today in Rome (from the
 * server's `Clock` at every run) and ready for the queries (AC14, D7): a
 * `to` one day after today is shortened to today, as a browser a few hours
 * ahead of the server may send it, and the comparison is computed on the
 * shortened window. A window that isn't two existing days in order, from 1
 * to 366 days, with `to` no later than tomorrow, fails with `InvalidWindow`.
 */
export const analysisRange = Effect.fn("analytics.analysisRange")(function* ({
  from,
  to,
  compare,
}: {
  from: string
  to: string
  compare: Compare
}) {
  const today = romeDay(new Date(yield* Clock.currentTimeMillis))
  const shortened = to === addDays(today, 1) ? today : to
  const window = validateWindow({ from, to: shortened }, today)
  if (window === null) return yield* new InvalidWindow()
  return {
    window,
    comparison: comparisonOf(window, compare),
  } satisfies AnalysisRange
})

/**
 * Runs `run` on the window and on its comparison at once, and gives both
 * results; `empty` stands for the comparison when there is none.
 */
export const withComparison = <A, B, E, R>(
  range: AnalysisRange,
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
