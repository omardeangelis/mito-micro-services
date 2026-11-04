import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import { importRunCustomer } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { periodBounds } from "@mito/domain/export/period"
import { type Day, addDays, daysSince } from "@mito/domain/wave/days"
import { query } from "../../../effect/db"
import { romeDayOf } from "../../../shared/sql"
import { isCallIn } from "../../export/callStats"

// The team of the Wave page (spec assegnazione-wave, Definizioni, AC12, AC19,
// AC23; D10): the OPERATORE and ADMIN users not disabled, with their operator
// row, each with pace, inactivity, «Attive» and the Wave's to-do. Four
// set-based queries, whatever the size of the team

/** Working days without calls after the last one that make a person inactive */
const INACTIVE_AFTER = 7
/** The days of the pace, before today */
const PACE_DAYS = 30

export type WaveTeamMember = {
  readonly operatorId: number
  readonly userId: string
  readonly name: string
  readonly role: "OPERATORE" | "ADMIN"
  readonly shown: boolean
  readonly pace: number
  readonly exactPace: number
  readonly inactiveDays: number | null
  readonly active: number
  readonly waveTodo: { readonly toCall: number; readonly noAnswer: number }
}

/** Da chiamare, as `sortPriority` of the contacts list (D10) */
export const isToCall = sql`(${task.state} IS NULL OR ${task.state} IN ('chiamare', 'followup', 'nessuno'))`
/** Non risponde (D10) */
export const isNoAnswer = sql`${task.state} = 'non risponde'`

const callDay = romeDayOf(taskEventLog.createdAt)

/** Italian alphabetical order of the name, then the user id (Definizioni) */
const byName = (a: WaveTeamMember, b: WaveTeamMember) =>
  a.name.localeCompare(b.name, "it") ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)

/**
 * The team at `now` (`today` is its Rome day) for the Wave `runId`, in order
 * of name. `registryAt` is `callsRegistryAt`
 */
export const waveTeam = Effect.fn("import.waveTeam")(function* (
  runId: number,
  now: Date,
  today: Day,
  registryAt: Date
) {
  const members = yield* query((client) =>
    client
      .select({
        operatorId: operators.id,
        userId: users.id,
        name: operators.name,
        surname: operators.surname,
        role: users.role,
      })
      .from(users)
      .innerJoin(operators, eq(operators.userId, users.id))
      .where(
        and(
          inArray(users.role, ["OPERATORE", "ADMIN"]),
          isNull(users.disabledAt)
        )
      )
  )
  if (members.length === 0) return []
  const ids = members.map((member) => member.operatorId)

  const startOfToday = periodBounds({ from: today, to: today }).start
  const pace = periodBounds({
    from: addDays(today, -PACE_DAYS),
    to: addDays(today, -1),
  })
  const inPace = sql`${taskEventLog.createdAt} >= ${pace.start.toISOString()}::timestamptz AND ${taskEventLog.createdAt} < ${pace.end.toISOString()}::timestamptz`

  // The calls of each person: the last one ever, and those of the 30 days
  // before today with the days they fall on
  const calls = yield* query((client) =>
    client
      .select({
        operatorId: taskEventLog.actorOperatorId,
        lastDay: sql<string>`max(${callDay})`,
        calls: sql<number>`(count(*) filter (where ${inPace}))::int`,
        days: sql<number>`(count(distinct ${callDay}) filter (where ${inPace}))::int`,
      })
      .from(taskEventLog)
      .where(
        and(
          isCallIn({ start: new Date(0), end: now }, registryAt),
          inArray(taskEventLog.actorOperatorId, ids)
        )
      )
      .groupBy(taskEventLog.actorOperatorId)
  )
  const callsOf = new Map(calls.map((row) => [row.operatorId, row]))

  // The worked days (Definizioni): days before today with a call of the team,
  // from the day after the earliest last call, the only ones inactivity reads
  const lastDays = calls.map((row) => row.lastDay).sort()
  const firstNeeded = lastDays[0]
  const workedDays =
    firstNeeded === undefined || firstNeeded >= today
      ? []
      : (yield* query((client) =>
          client
            .selectDistinct({ day: callDay })
            .from(taskEventLog)
            .where(
              and(
                isCallIn(
                  {
                    start: periodBounds({
                      from: addDays(firstNeeded, 1),
                      to: today,
                    }).start,
                    end: startOfToday,
                  },
                  registryAt
                ),
                inArray(taskEventLog.actorOperatorId, ids)
              )
            )
        )).map((row) => row.day)

  // The active contacts of each person: «Attive», all of them (for the admins
  // shown), and the Wave's to-do by state
  const contacts = yield* query((client) =>
    client
      .select({
        operatorId: task.operatorId,
        all: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${isToCall} OR ${isNoAnswer}))::int`,
        toCall: sql<number>`(count(*) filter (where ${importRunCustomer.runId} IS NOT NULL AND ${isToCall}))::int`,
        noAnswer: sql<number>`(count(*) filter (where ${importRunCustomer.runId} IS NOT NULL AND ${isNoAnswer}))::int`,
      })
      .from(task)
      .leftJoin(
        importRunCustomer,
        and(
          eq(importRunCustomer.customerId, task.customerId),
          eq(importRunCustomer.runId, runId)
        )
      )
      .where(and(task.isActive, inArray(task.operatorId, ids)))
      .groupBy(task.operatorId)
  )
  const contactsOf = new Map(contacts.map((row) => [row.operatorId, row]))

  const recentFrom = addDays(today, -PACE_DAYS)
  return members
    .map((member): WaveTeamMember => {
      const called = callsOf.get(member.operatorId)
      const owned = contactsOf.get(member.operatorId)
      const exactPace =
        called && called.days > 0 ? called.calls / called.days : 0
      const lastDay = called?.lastDay
      const workedSince =
        lastDay === undefined
          ? 0
          : workedDays.filter((day) => day > lastDay).length
      const inactive = lastDay !== undefined && workedSince >= INACTIVE_AFTER
      const role = member.role
      return {
        operatorId: member.operatorId,
        userId: member.userId,
        name: [member.name, member.surname].filter(Boolean).join(" "),
        role,
        // Every operator; an admin who called in the last 30 days or has
        // active contacts (Definizioni)
        shown:
          role === "OPERATORE" ||
          (lastDay !== undefined && lastDay >= recentFrom) ||
          (owned?.all ?? 0) > 0,
        pace: Math.round(exactPace),
        exactPace,
        inactiveDays:
          inactive && lastDay !== undefined ? daysSince(lastDay, today) : null,
        active: owned?.active ?? 0,
        waveTodo: {
          toCall: owned?.toCall ?? 0,
          noAnswer: owned?.noAnswer ?? 0,
        },
      }
    })
    .sort(byName)
})
