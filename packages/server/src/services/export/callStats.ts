import "server-only"
import { and, eq, gte, inArray, lt, ne, sql } from "drizzle-orm"
import { Effect } from "effect"
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

/** The changes made by hand: from the list or the detail of a contact. */
const manualSources = ["detail", "list"] as const

/**
 * The calls each operator made in `[start, end)`: the manual changes of state
 * from a state of `callFromStates` to one of `callToStates` in the log of the
 * contacts (`isCall` in `@mito/domain/export/calls`), counted for the operator
 * who made them. One query, grouped by operator; only operators with at least
 * one call appear.
 */
export const callStats = ({ start, end }: { start: Date; end: Date }) =>
  Effect.gen(function* () {
    const counted = yield* query((client) =>
      client
        .select({
          operatorId: operators.id,
          name: operators.name,
          surname: operators.surname,
          calls: sql<number>`count(*)::int`,
          appointments: sql<number>`(count(*) filter (where ${taskEventLog.toState} = ${appointmentState}))::int`,
          noAnswer: sql<number>`(count(*) filter (where ${taskEventLog.toState} = ${noAnswerState}))::int`,
        })
        .from(taskEventLog)
        .innerJoin(operators, eq(operators.id, taskEventLog.actorOperatorId))
        .where(
          and(
            eq(taskEventLog.action, "state_change"),
            inArray(taskEventLog.source, [...manualSources]),
            inArray(taskEventLog.fromState, [...callFromStates]),
            inArray(taskEventLog.toState, [...callToStates]),
            ne(taskEventLog.fromState, taskEventLog.toState),
            gte(taskEventLog.createdAt, start),
            lt(taskEventLog.createdAt, end)
          )
        )
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
