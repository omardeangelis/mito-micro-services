import { Effect } from "effect"
import { and, asc, eq, sql } from "drizzle-orm"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { appointmentState, noAnswerState } from "@mito/domain/export/calls"
import type { DayRange } from "@mito/domain/analytics/window"
import type { Actor } from "@mito/domain/contact/permissions"
import { periodBounds } from "@mito/domain/export/period"
import { query } from "../../effect/db"
import { callStats, isCallIn } from "../export/callStats"
import { romeDayOf } from "../../shared/sql"
import { withComparison, type AnalysisRange } from "./range"

/**
 * The calls of every operator in the window, as the calls export counts them
 * (`callStats`, one row per operator with calls, more calls first), and the
 * totals of the comparison, `null` with no comparison (AC12, AC16). The
 * browser takes the variation of the calls and of the appointment rate from
 * the totals.
 */
export const callsByOperator = Effect.fn("analytics.callsByOperator")(
  function* ({ window, comparison }: AnalysisRange) {
    const [{ rows }, compared] = yield* withComparison(
      { window, comparison },
      null,
      (range) => callStats(periodBounds(range))
    )
    return {
      window,
      comparison,
      rows,
      comparisonTotals:
        compared === null
          ? null
          : {
              calls: compared.totals.calls,
              answered: compared.totals.answered,
              appointments: compared.totals.appointments,
            },
    }
  }
)

/** The Rome calendar day of a call, as `YYYY-MM-DD` (A1) */
const callDay = romeDayOf(taskEventLog.createdAt)

/**
 * The calls of one operator on each Rome day of `range`: only the days with at
 * least one call, by day. The same calls the export counts (`isCallIn`).
 */
const callDaysOf = Effect.fnUntraced(function* (
  range: DayRange,
  operatorId: number
) {
  const rows = yield* query((client) =>
    client
      .select({
        day: callDay,
        calls: sql<number>`count(*)::int`,
        appointments: sql<number>`(count(*) filter (where ${taskEventLog.toState} = ${appointmentState}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${taskEventLog.toState} = ${noAnswerState}))::int`,
      })
      .from(taskEventLog)
      .where(
        and(
          isCallIn(periodBounds(range)),
          eq(taskEventLog.actorOperatorId, operatorId)
        )
      )
      .groupBy(callDay)
      .orderBy(asc(callDay))
  )

  return rows.map((row) => ({
    day: row.day,
    calls: Number(row.calls),
    answered: Number(row.calls) - Number(row.noAnswer),
    noAnswer: Number(row.noAnswer),
    appointments: Number(row.appointments),
  }))
})

/**
 * The calls of the operator who asks, day by day, in the window and in its
 * comparison (`[]` with no comparison). The operator is the actor's and
 * nothing else: the numbers of the others are only in `callsByOperator`,
 * behind the admin (AC18, D8).
 */
export const myCallSeries = Effect.fn("analytics.myCallSeries")(function* ({
  window,
  comparison,
  actor,
}: AnalysisRange & { actor: Actor }) {
  const [days, comparisonDays] = yield* withComparison(
    { window, comparison },
    [],
    (range) => callDaysOf(range, actor.operatorId)
  )
  return { window, comparison, days, comparisonDays }
})
