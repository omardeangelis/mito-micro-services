import { Clock, Effect } from "effect"
import { and, eq, inArray, max, sql } from "drizzle-orm"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { type Actor } from "@mito/domain/contact/permissions"
import { romeDay, romeDayBounds } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { daysSince } from "@mito/domain/wave/days"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query } from "../../effect/db"
import {
  buildContactsOrder,
  buildContactsWhere,
  openAlertOf,
} from "../contact/getContacts"

/** A callback of the actor, as `MyCallback` of @mito/contract. */
export type MyCallback = {
  alertId: number
  taskId: number
  customerId: string
  name: string | null
  surname: string | null
  phoneNumber: string | null
  message: string | null
  deadline: Date
  dueDay: string
  daysLate: number
  state: TaskStatus | null
  triedAt: Date | null
}

/** The last unanswered call of each customer, by anyone (D5). */
const lastUnansweredCalls = Effect.fnUntraced(function* (
  customerIds: readonly string[]
) {
  if (customerIds.length === 0) return new Map<string, Date>()
  const rows = yield* query((client) =>
    client
      .select({
        customerId: taskEventLog.customerId,
        at: max(taskEventLog.createdAt),
      })
      .from(taskEventLog)
      .where(
        and(
          inArray(taskEventLog.customerId, [...customerIds]),
          eq(taskEventLog.action, "call"),
          eq(taskEventLog.outcome, "non risponde")
        )
      )
      .groupBy(taskEventLog.customerId)
  )
  return new Map(
    rows.flatMap(({ customerId, at }) =>
      at === null ? [] : [[customerId, at] as const]
    )
  )
})

/**
 * The actor's callbacks: the open alerts due today or earlier on the contacts
 * «Solo i miei» of the list, whatever the role (AC2, AC11), all of them
 * (AC14). The oldest Rome day first, and inside a day as the list by priority
 * (AC12, OQ4).
 */
export const listMyCallbacks = Effect.fn("home.listMyCallbacks")(function* ({
  actor,
}: {
  actor: Actor
}): Effect.fn.Return<MyCallback[], DbError, Db> {
  const now = new Date(yield* Clock.currentTimeMillis)
  const today = romeDay(now)
  const filters = getContactsInput.parse({
    onlyMe: true,
    hasAlert: true,
    dateField: "nextAlert",
    to: today,
  })
  const rows = yield* query((client) =>
    client
      .select({
        taskId: task.id,
        state: task.state,
        customer: {
          id: customers.id,
          name: customers.name,
          surname: customers.surname,
          phoneNumber: customers.phoneNumber,
        },
        alert: {
          id: alert.id,
          deadline: alert.deadline,
          message: alert.message,
        },
      })
      .from(task)
      .innerJoin(customers, eq(customers.id, task.customerId))
      .leftJoin(operators, eq(operators.id, task.operatorId))
      .leftJoin(alert, openAlertOf)
      .where(buildContactsWhere(filters, actor))
      .orderBy(
        sql`(${alert.deadline} AT TIME ZONE 'Europe/Rome')::date ASC`,
        ...buildContactsOrder(filters, romeDayBounds(now).end, today)
      )
  )
  const lastCalls = yield* lastUnansweredCalls([
    ...new Set(rows.map(({ customer }) => customer.id)),
  ])

  return rows.flatMap(({ taskId, state, customer, alert: open }) => {
    // Never null: the filter keeps only the contacts with an open alert
    if (open === null) return []
    const dueDay = romeDay(open.deadline)
    // The last call is the only candidate: if it came before the due day, so
    // did all the others
    const lastCall = lastCalls.get(customer.id)
    const tried =
      lastCall !== undefined && lastCall >= romeDayBounds(open.deadline).start
    return [
      {
        alertId: open.id,
        taskId,
        customerId: customer.id,
        name: customer.name,
        surname: customer.surname,
        phoneNumber: customer.phoneNumber,
        message: open.message,
        deadline: open.deadline,
        dueDay,
        daysLate: daysSince(dueDay, today),
        state,
        triedAt: tried ? lastCall : null,
      },
    ]
  })
})
