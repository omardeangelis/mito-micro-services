import { Clock, Effect } from "effect"
import type { TimeFrame } from "@mito/domain/constants/timeframes"

const DAY_MS = 86_400_000

/** The days in each time frame. */
const DAYS = {
  "30d": 30,
  "90d": 90,
  "365d": 365,
} satisfies Record<TimeFrame, number>

/** A span of time: `start` and `end` are instants. */
export type FinanceWindow = { start: Date; end: Date }

/** The two spans the amounts of a time frame are counted on. */
export type FinanceWindows = {
  reference: FinanceWindow
  comparison: FinanceWindow
}

/**
 * The windows of `timeFrame` (N days of 24 hours), counted back from the
 * server's `Clock` at every run, never from the time the module loaded:
 *
 * - `reference`: from now − N days to now, both ends included;
 * - `comparison`: from now − 2N days, included, to now − N days, excluded
 *   (`comparison.end` is `reference.start`).
 */
export const financeWindows = Effect.fn("analytics.financeWindows")(function* (
  timeFrame: TimeFrame
) {
  const now = yield* Clock.currentTimeMillis
  const span = DAYS[timeFrame] * DAY_MS

  return {
    reference: { start: new Date(now - span), end: new Date(now) },
    comparison: {
      start: new Date(now - 2 * span),
      end: new Date(now - span),
    },
  } satisfies FinanceWindows
})
