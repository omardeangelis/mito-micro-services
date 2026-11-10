import { Effect } from "effect"
import { and, asc, eq, sql } from "drizzle-orm"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  appointmentState,
  noAnswerState,
  totalsOf,
  type CallStats,
} from "@mito/domain/export/calls"
import type { HourSlot } from "@mito/domain/analytics/hours"
import type { DayRange } from "@mito/domain/analytics/window"
import { romeDay, romeTime } from "@mito/domain/contact/time"
import type { Actor } from "@mito/domain/contact/permissions"
import { periodBounds } from "@mito/domain/export/period"
import { query } from "../../effect/db"
import {
  callResult,
  callsRegistryAt,
  callStats,
  isCallIn,
} from "../export/callStats"
import { romeDayOf, romeHourOf } from "../../shared/sql"
import { withComparison, type AnalysisRange } from "./range"

/** From the start of the first slot to the end of the last; `null` with none */
const spanOf = (slots: readonly HourSlot[]) => {
  const first = slots[0]
  const last = slots.at(-1)
  return first === undefined || last === undefined
    ? null
    : { start: first.start, end: last.end }
}

/** The calls of `slots` as the export counts them; no query with no slots */
const statsOver = (slots: readonly HourSlot[]) => {
  const span = spanOf(slots)
  return span === null
    ? Effect.succeed({ rows: [], totals: totalsOf([]) } satisfies CallStats)
    : callStats(span)
}

/** The totals of the comparison the browser reads */
const comparedTotals = (compared: CallStats | null) =>
  compared === null
    ? null
    : {
        calls: compared.totals.calls,
        answered: compared.totals.answered,
        appointments: compared.totals.appointments,
      }

/**
 * Runs `run` on the hours of «Oggi» and on the ones they are compared with at
 * once; `null` for the comparison when there is none (AC20).
 */
const overHours = <A, E, R>(
  hours: readonly HourSlot[],
  comparisonHours: readonly HourSlot[] | null,
  run: (slots: readonly HourSlot[]) => Effect.Effect<A, E, R>
) =>
  Effect.all(
    [
      run(hours),
      comparisonHours === null ? Effect.succeed(null) : run(comparisonHours),
    ],
    { concurrency: "unbounded" }
  )

/**
 * The calls of every operator in the window, as the calls export counts them
 * (`callStats`, one row per operator with calls, more calls first), and the
 * totals of the comparison, `null` with no comparison (AC12, AC16). The
 * browser takes the variation of the calls and of the appointment rate from
 * the totals. With «Oggi» only the calls in its hours, the one in progress
 * included, and the rows of the comparison hours too (AC21, AC24, AC27).
 */
export const callsByOperator = Effect.fn("analytics.callsByOperator")(
  function* ({ window, comparison, hours, comparisonHours }: AnalysisRange) {
    if (hours !== null) {
      const [current, compared] = yield* overHours(
        hours,
        comparisonHours,
        statsOver
      )
      return {
        window,
        comparison,
        hours,
        comparisonHours,
        rows: current.rows,
        comparisonRows: compared === null ? null : compared.rows,
        comparisonTotals: comparedTotals(compared),
      }
    }
    const [{ rows }, compared] = yield* withComparison(
      { window, comparison },
      null,
      (range) => callStats(periodBounds(range))
    )
    return {
      window,
      comparison,
      hours: null,
      comparisonHours: null,
      rows,
      comparisonRows: null,
      comparisonTotals: comparedTotals(compared),
    }
  }
)

/** The Rome hour of a call, as `YYYY-MM-DD HH` */
const callHour = romeHourOf(taskEventLog.createdAt)

/** The Rome hour a slot starts in, as `romeHourOf` writes it */
const hourKey = (slot: HourSlot) =>
  `${romeDay(slot.start)} ${romeTime(slot.start).slice(0, 2)}`

/**
 * The calls in each of `slots`, one row per slot, zeros included, in one
 * query: a call belongs to the Rome hour it was registered in (AC26), only
 * the operator's with `operatorId`. The same calls the export counts
 * (`isCallIn`); no query with no slots.
 */
export const callsByHour = Effect.fn("analytics.callsByHour")(function* (
  slots: readonly HourSlot[],
  operatorId?: number
) {
  const span = spanOf(slots)
  if (span === null) return []
  const registryAt = yield* callsRegistryAt()
  const rows = yield* query((client) =>
    client
      .select({
        hour: callHour,
        calls: sql<number>`count(*)::int`,
        appointments: sql<number>`(count(*) filter (where ${callResult} = ${appointmentState}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${callResult} = ${noAnswerState}))::int`,
      })
      .from(taskEventLog)
      .where(
        and(
          isCallIn(span, registryAt),
          operatorId === undefined
            ? undefined
            : eq(taskEventLog.actorOperatorId, operatorId)
        )
      )
      .groupBy(callHour)
  )
  const byHour = new Map(rows.map((row) => [row.hour, row]))
  return slots.map((slot) => {
    const row = byHour.get(hourKey(slot))
    const calls = Number(row?.calls ?? 0)
    const noAnswer = Number(row?.noAnswer ?? 0)
    return {
      start: slot.start,
      end: slot.end,
      inProgress: slot.inProgress,
      calls,
      answered: calls - noAnswer,
      noAnswer,
      appointments: Number(row?.appointments ?? 0),
    }
  })
})

/** The Rome calendar day of a call, as `YYYY-MM-DD` (A1) */
const callDay = romeDayOf(taskEventLog.createdAt)

/**
 * The calls on each Rome day of `range`, of one operator or, without
 * `operatorId`, of everyone: only the days with at least one call, by day.
 * The same calls the export counts (`isCallIn`).
 */
export const callDaysOf = Effect.fnUntraced(function* (
  range: DayRange,
  operatorId?: number
) {
  const registryAt = yield* callsRegistryAt()
  const rows = yield* query((client) =>
    client
      .select({
        day: callDay,
        calls: sql<number>`count(*)::int`,
        appointments: sql<number>`(count(*) filter (where ${callResult} = ${appointmentState}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${callResult} = ${noAnswerState}))::int`,
      })
      .from(taskEventLog)
      .where(
        and(
          isCallIn(periodBounds(range), registryAt),
          operatorId === undefined
            ? undefined
            : eq(taskEventLog.actorOperatorId, operatorId)
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
  hours,
  comparisonHours,
  actor,
}: AnalysisRange & { actor: Actor }) {
  if (hours !== null) {
    const [current, compared] = yield* overHours(
      hours,
      comparisonHours,
      (slots) => callsByHour(slots, actor.operatorId)
    )
    return {
      window,
      comparison,
      hours: current,
      comparisonHours: compared,
      days: [],
      comparisonDays: [],
    }
  }
  const [days, comparisonDays] = yield* withComparison(
    { window, comparison },
    [],
    (range) => callDaysOf(range, actor.operatorId)
  )
  return {
    window,
    comparison,
    hours: null,
    comparisonHours: null,
    days,
    comparisonDays,
  }
})
