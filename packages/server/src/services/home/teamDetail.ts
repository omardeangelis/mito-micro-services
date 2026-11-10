import { and, eq, inArray, lt, lte, sql } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { romeDay, romeDayBounds } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { daysSince } from "@mito/domain/wave/days"
import { customers } from "@mito/db/schema/customers"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query } from "../../effect/db"
import { openAlertOf } from "../contact/getContacts"
import {
  type CallsRegistryMissing,
  callsRegistryAt,
  isCallIn,
} from "../export/callStats"
import { customerTouched, isToCall } from "../import/wave/parts"
import {
  type TeamPerson,
  isNoAnswer,
  teamActivity,
  teamMembers,
} from "../import/wave/team"
import { lastUnansweredCalls } from "./myCallbacks"
import { readCalls } from "./myCalls"
import { teamCallsToday } from "./team"

/** The overdue callbacks shown for a person (AC29) */
const OVERDUE_ROWS = 6

/** An overdue callback, as `TeamOverdueRow` of @mito/contract */
type OverdueRow = {
  taskId: number
  name: string | null
  message: string | null
  daysLate: number
  triedAt: Date | null
}

/** A call of today, as `TeamTodayCall` of @mito/contract */
type TodayCall = {
  id: number
  at: Date
  taskId: number | null
  name: string | null
  outcome: TaskStatus | null
  message: string | null
}

/** A person of the team, as `TeamMember` of @mito/contract */
type TeamDetailMember = TeamPerson & {
  calls: number
  answered: number
  appointments: number
  lastCallAt: Date | null
  inactiveDays: number | null
  toCall: number
  neverCalled: number
  overdue: {
    total: number
    oldestDays: number | null
    rows: OverdueRow[]
  }
  todayCalls: TodayCall[]
}

/** «Dettaglio giornaliero», as `TeamDetail` of @mito/contract */
export type TeamDetail = {
  now: Date
  today: string
  members: TeamDetailMember[]
}

const fullName = (name: string | null, surname: string | null) =>
  [name, surname].filter(Boolean).join(" ") || null

/** «Da chiamare» and «Mai chiamati» of the people `ids` who have any */
const contactCounts = Effect.fnUntraced(function* (
  ids: ReadonlyArray<number>,
  now: Date,
  registryAt: Date
) {
  const rows = yield* query((client) =>
    client
      .select({
        operatorId: task.operatorId,
        toCall: sql<number>`(count(*) filter (where ${isToCall} OR ${isNoAnswer}))::int`,
        neverCalled: sql<number>`(count(*) filter (where ${isToCall} AND NOT ${customerTouched(now, registryAt)}))::int`,
      })
      .from(task)
      .leftJoin(alert, openAlertOf)
      .where(and(task.isActive, inArray(task.operatorId, [...ids])))
      .groupBy(task.operatorId)
  )
  return new Map(rows.map((row) => [row.operatorId, row]))
})

/**
 * The first `OVERDUE_ROWS` overdue callbacks of each of the people `ids`, the
 * oldest first (D14), with how many they are: an open alert of an active
 * contact, due before the Rome day of `now`. The limit is per person, so one
 * far behind doesn't weigh on the whole response.
 */
const overdueOf = Effect.fnUntraced(function* (
  ids: ReadonlyArray<number>,
  now: Date
) {
  const today = romeDay(now)
  const startOfToday = romeDayBounds(now).start
  const rows = yield* query((client) => {
    const ranked = client
      .select({
        // Never null: the `where` keeps only the people `ids`
        operatorId: sql<number>`${task.operatorId}`.as("operator_id"),
        taskId: sql<number>`${task.id}`.as("task_id"),
        customerId: customers.id,
        name: customers.name,
        surname: customers.surname,
        message: alert.message,
        deadline: alert.deadline,
        position:
          sql<number>`(row_number() over (partition by ${task.operatorId} order by ${alert.deadline}, ${alert.id}))::int`.as(
            "position"
          ),
        total:
          sql<number>`(count(*) over (partition by ${task.operatorId}))::int`.as(
            "total"
          ),
      })
      .from(task)
      .innerJoin(alert, openAlertOf)
      .innerJoin(customers, eq(customers.id, task.customerId))
      .where(
        and(
          task.isActive,
          inArray(task.operatorId, [...ids]),
          lt(alert.deadline, startOfToday)
        )
      )
      .as("ranked")

    return client
      .select()
      .from(ranked)
      .where(lte(ranked.position, OVERDUE_ROWS))
      .orderBy(ranked.operatorId, ranked.position)
  })
  const triedToday = yield* lastUnansweredCalls(
    [...new Set(rows.map(({ customerId }) => customerId))],
    startOfToday
  )
  const byPerson = new Map<number, { total: number; rows: OverdueRow[] }>()
  for (const row of rows) {
    const person = byPerson.get(row.operatorId) ?? {
      total: row.total,
      rows: [],
    }
    person.rows.push({
      taskId: row.taskId,
      name: fullName(row.name, row.surname),
      message: row.message,
      daysLate: daysSince(romeDay(row.deadline), today),
      triedAt: triedToday.get(row.customerId) ?? null,
    })
    byPerson.set(row.operatorId, person)
  }
  return byPerson
})

/**
 * «Dettaglio giornaliero» at the Clock's instant (spec home-admin, AC28, AC29,
 * D11, D14): one row per person of `teamMembers`, with everything their detail
 * shows, since it opens without loading. Their calls are `teamCallsToday`, the
 * rows `getTeamDay` adds up (AC7). One query per piece of data, for the whole
 * team.
 */
export const getTeamDetail = Effect.fn("home.getTeamDetail")(
  function* (): Effect.fn.Return<
    TeamDetail,
    CallsRegistryMissing | DbError,
    Db
  > {
    const now = new Date(yield* Clock.currentTimeMillis)
    const today = romeDay(now)
    const registryAt = yield* callsRegistryAt()
    const members = yield* teamMembers()
    const ids = members.map(({ operatorId }) => operatorId)

    const [perPerson, activity, contactsOf, overdueByPerson, calls] =
      yield* Effect.all(
        [
          teamCallsToday(ids, now),
          teamActivity(ids, now, today, registryAt),
          contactCounts(ids, now, registryAt),
          overdueOf(ids, now),
          readCalls(
            and(
              inArray(taskEventLog.actorOperatorId, ids),
              isCallIn(romeDayBounds(now), registryAt)
            )
          ),
        ],
        { concurrency: "unbounded" }
      )
    const callsOf = new Map(perPerson.map((row) => [row.operatorId, row]))
    const todayCallsOf = new Map<number, TodayCall[]>()
    for (const { operatorId, call } of calls) {
      const person = todayCallsOf.get(operatorId) ?? []
      person.push({
        id: call.id,
        at: call.at,
        taskId: call.taskId,
        name: fullName(call.name, call.surname),
        outcome: call.outcome,
        message: call.message,
      })
      todayCallsOf.set(operatorId, person)
    }

    return {
      now,
      today,
      members: members.map((member): TeamDetailMember => {
        const { operatorId } = member
        const made = callsOf.get(operatorId)
        const called = activity.get(operatorId)
        const owned = contactsOf.get(operatorId)
        const late = overdueByPerson.get(operatorId)
        return {
          ...member,
          calls: made?.calls ?? 0,
          answered: made?.answered ?? 0,
          appointments: made?.appointments ?? 0,
          lastCallAt: called?.lastCallAt ?? null,
          inactiveDays: called?.inactiveDays ?? null,
          toCall: owned?.toCall ?? 0,
          neverCalled: owned?.neverCalled ?? 0,
          overdue: {
            total: late?.total ?? 0,
            // The rows start from the oldest, and the limit keeps it
            oldestDays: late?.rows[0]?.daysLate ?? null,
            rows: late?.rows ?? [],
          },
          todayCalls: todayCallsOf.get(operatorId) ?? [],
        }
      }),
    }
  }
)
