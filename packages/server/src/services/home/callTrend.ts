import { Clock, Effect } from "effect"
import { type CallTrend, type CallTrendPeriod } from "@mito/contract/home"
import { todayHours } from "@mito/domain/analytics/hours"
import { presetRange } from "@mito/domain/analytics/window"
import { romeDay } from "@mito/domain/contact/time"
import { type Db, type DbError } from "../../effect/db"
import { type CallsRegistryMissing } from "../export/callStats"
import { callDaysOf, callsByHour } from "../analytics/calls"

/**
 * The calls of the whole team, disabled people included (the set of «Risposte
 * per operatore»), for the trend charts of the admin's home (spec
 * andamenti-chiamate, AC5, AC9, AC26, AC27). With `today` the hours of «Oggi»
 * at the Clock's instant and no days; otherwise the Rome days with calls in
 * the preset window, today included, and no hours.
 */
export const getCallTrend = Effect.fn("home.getCallTrend")(function* (
  period: CallTrendPeriod
): Effect.fn.Return<CallTrend, CallsRegistryMissing | DbError, Db> {
  const now = new Date(yield* Clock.currentTimeMillis)
  const window = presetRange(period, romeDay(now))
  if (period === "today") {
    const hours = yield* callsByHour(todayHours(now))
    return { period, window, days: [], hours }
  }
  const days = yield* callDaysOf(window)
  return { period, window, days, hours: null }
})
