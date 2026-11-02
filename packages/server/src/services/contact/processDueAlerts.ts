import { Clock, Effect, Schema } from "effect"
import { and, asc, eq, exists, sql } from "drizzle-orm"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { type Alert, type Task } from "@mito/domain/schemas"
import { operators } from "@mito/db/schema/operators"
import { alert as alerts, task as tasks } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
  type Tx,
} from "../../effect/db"
import { type ErrorReporter, forEachIsolated } from "../../effect/errorReporter"
import { touchCustomer } from "./guard"

/** The synthetic operator the cron acts as is missing from `operators`. */
export class SystemOperatorMissing extends Schema.TaggedError<SystemOperatorMissing>()(
  "SystemOperatorMissing",
  {}
) {}

type DueAlert = { task: Task; alert: Alert }

// The cron's days are the days in Italy. The app saves a deadline as midnight
// there, 22:00 or 23:00 UTC of the day before: in the time zone of the server
// (UTC on Vercel) or of the database session it can fall on another day.

const italianDayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** The day `date` falls on in Italy, as `YYYY-MM-DD`. */
function italianDay(date: Date) {
  const parts = italianDayFormat.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** The day an alert falls due in Italy, whatever the session's time zone. */
const deadlineDay = sql`DATE(${alerts.deadline} AT TIME ZONE 'Europe/Rome')`

/**
 * Moves one contact from `richiamare` to `chiamare` (AC19). The alert stays
 * open, nothing else is written but the log row of the change, which is not a
 * call. The state is read again under the customer's lock: a contact that is
 * no longer an active `richiamare` on this open alert (changed, replaced,
 * alert closed, or already worked by an overlapping run) is skipped.
 */
const processAlert = Effect.fnUntraced(function* (
  { task: contact, alert }: DueAlert,
  systemOperatorId: number
): Effect.fn.Return<
  "processed" | "skipped",
  DbError | CustomerMissing,
  Db | Tx
> {
  const customer = yield* lockCustomer(contact.customerId)
  const moved = yield* query((client) =>
    client
      .update(tasks)
      .set({ state: "chiamare" })
      .where(
        and(
          eq(tasks.id, contact.id),
          eq(tasks.state, "richiamare"),
          eq(tasks.isActive, true),
          eq(tasks.alertId, alert.id),
          // An overlapping run may have closed the alert since the list was read
          exists(
            client
              .select({ id: alerts.id })
              .from(alerts)
              .where(and(eq(alerts.id, alert.id), eq(alerts.isResolved, false)))
          )
        )
      )
      .returning({ id: tasks.id })
  )
  if (moved.length === 0) return "skipped"

  yield* query((client) =>
    client.insert(taskEventLog).values({
      customerId: customer.id,
      taskId: contact.id,
      actorOperatorId: systemOperatorId,
      action: "state_change",
      source: "cron_alert",
      fromState: "richiamare",
      toState: "chiamare",
    })
  )
  yield* touchCustomer(customer)
  return "processed"
})

/**
 * The alert cron (AC19, AC20): for the open alerts due today or earlier on an
 * active contact in `richiamare`, moves the contact to `chiamare`, each in its
 * own transaction. The alerts stay open. Other states and inactive contacts
 * are not touched, and a contact already moved is no longer `richiamare`, so a
 * second run finds nothing to do. An alert that fails is counted in `failed`,
 * logged and reported, and the others go on.
 *
 * Once `budgetMs` has passed since the start it takes no new alert, but always
 * takes the first: the ones left are counted in `remaining`, their contacts
 * stay in `richiamare` and the next call takes them.
 */
export const processDueAlerts = Effect.fn("contact.processDueAlerts")(
  function* (
    now: Date,
    { budgetMs }: { budgetMs: number }
  ): Effect.fn.Return<
    {
      found: number
      processed: number
      skipped: number
      failed: number
      remaining: number
    },
    DbError | SystemOperatorMissing,
    Db | ErrorReporter
  > {
    const start = yield* Clock.currentTimeMillis
    const [systemOperator] = yield* query((client) =>
      client
        .select({ id: operators.id })
        .from(operators)
        .where(eq(operators.userId, SYSTEM_OPERATOR_USER_ID))
    )
    if (!systemOperator) return yield* new SystemOperatorMissing()

    const today = italianDay(now)

    const rows = yield* query((client) =>
      client
        .select({ task: tasks, alert: alerts })
        .from(alerts)
        .innerJoin(tasks, eq(alerts.id, tasks.alertId))
        .where(
          and(
            eq(alerts.isResolved, false),
            eq(alerts.taskId, tasks.id),
            eq(tasks.isActive, true),
            eq(tasks.state, "richiamare"),
            sql`${deadlineDay} <= ${today}`
          )
        )
        .orderBy(asc(alerts.id))
    )
    const { succeeded, failed } = yield* forEachIsolated(
      rows,
      Effect.fnUntraced(function* (row: DueAlert, index: number) {
        const elapsed = (yield* Clock.currentTimeMillis) - start
        if (index > 0 && elapsed >= budgetMs) return "remaining" as const
        return yield* transaction(processAlert(row, systemOperator.id))
      }),
      ({ task, alert }) => ({ alertId: alert.id, customerId: task.customerId })
    )
    const count = (outcome: (typeof succeeded)[number]) =>
      succeeded.filter((each) => each === outcome).length
    return {
      found: rows.length,
      processed: count("processed"),
      skipped: count("skipped"),
      failed,
      remaining: count("remaining"),
    }
  }
)
