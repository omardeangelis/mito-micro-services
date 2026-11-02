import { and, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { appMilestone } from "@mito/db/schema/appMilestone"
import { operators } from "@mito/db/schema/operators"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  appointmentState,
  callFromStates,
  callToStates,
  noAnswerState,
  sortByCalls,
  totalsOf,
  type CallStats,
} from "@mito/domain/export/calls"
import { query } from "../../effect/db"

/**
 * The row `calls_registry` of `app_milestone` is missing: without the instant
 * the old and the new rule of a call can't be told apart (D14). A failure,
 * not a guess: counting with the wrong rule would give wrong numbers.
 */
export class CallsRegistryMissing extends Schema.TaggedError<CallsRegistryMissing>()(
  "CallsRegistryMissing",
  {}
) {}

/**
 * The instant `calls_registry` was written (AC28): the calls before it are the
 * manual changes of state of the old rule, the ones after it are the rows
 * `call`. Fails with `CallsRegistryMissing` without the row.
 */
export const callsRegistryAt = Effect.fn("export.callsRegistryAt")(
  function* () {
    const rows = yield* query((client) =>
      client
        .select({ at: appMilestone.at })
        .from(appMilestone)
        .where(eq(appMilestone.name, "calls_registry"))
        .limit(1)
    )
    const row = rows[0]
    if (row === undefined) return yield* new CallsRegistryMissing()
    return row.at
  }
)

/** The changes made by hand: from the list or the detail of a contact. */
const manualSources = ["detail", "list"] as const

/**
 * The state a call ended in: the outcome of a `call` row, the state it went to
 * for the old rows, which have no outcome. Answers and appointments are read
 * from it (D14).
 */
export const callResult = sql`coalesce(${taskEventLog.outcome}, ${taskEventLog.toState})`

/**
 * The `where` of a call made in `[start, end)`, the one predicate of every
 * query that counts calls (the export, the analysis page, the history), so
 * they never diverge (D14, AC26-AC28): a `call` row, or, before
 * `registryAt` (`callsRegistryAt`), a manual change of state in the log of the
 * contacts from a state of `callFromStates` to one of `callToStates`
 * (`isCall` in `@mito/domain/export/calls`).
 */
export const isCallIn = (
  { start, end }: { start: Date; end: Date },
  registryAt: Date
) =>
  and(
    or(
      eq(taskEventLog.action, "call"),
      and(
        eq(taskEventLog.action, "state_change"),
        inArray(taskEventLog.source, [...manualSources]),
        inArray(taskEventLog.fromState, [...callFromStates]),
        inArray(taskEventLog.toState, [...callToStates]),
        ne(taskEventLog.fromState, taskEventLog.toState),
        lt(taskEventLog.createdAt, registryAt)
      )
    ),
    gte(taskEventLog.createdAt, start),
    lt(taskEventLog.createdAt, end)
  )

/**
 * The calls each operator made in `[start, end)` (`isCallIn`), counted for the
 * operator who made them. One query, grouped by operator; only operators with at least
 * one call appear.
 */
export const callStats = Effect.fn("export.callStats")(function* ({
  start,
  end,
}: {
  start: Date
  end: Date
}) {
  const registryAt = yield* callsRegistryAt()
  const counted = yield* query((client) =>
    client
      .select({
        operatorId: operators.id,
        name: operators.name,
        surname: operators.surname,
        calls: sql<number>`count(*)::int`,
        appointments: sql<number>`(count(*) filter (where ${callResult} = ${appointmentState}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${callResult} = ${noAnswerState}))::int`,
      })
      .from(taskEventLog)
      .innerJoin(operators, eq(operators.id, taskEventLog.actorOperatorId))
      .where(isCallIn({ start, end }, registryAt))
      .groupBy(operators.id, operators.name, operators.surname)
  )

  const rows = sortByCalls(
    counted.map((row) => ({
      ...row,
      name: row.name ?? "",
      surname: row.surname ?? "",
      answered: row.calls - row.noAnswer,
    }))
  )
  return { rows, totals: totalsOf(rows) } satisfies CallStats
})
