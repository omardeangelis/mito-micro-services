import "server-only"
import { Clock, Data, Effect } from "effect"
import { and, asc, desc, eq, sql } from "drizzle-orm"
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
} from "@/server/effect/db"
import {
  type ErrorReporter,
  forEachIsolated,
} from "@/server/effect/errorReporter"
import { replaceActiveContact } from "./activeContact"

/** The synthetic operator the cron acts as is missing from `operators`. */
export class SystemOperatorMissing extends Data.TaggedError(
  "SystemOperatorMissing"
)<Record<never, never>> {}

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
 * Resolves one alert. Due today, the customer gets a `followup` contact for
 * its operator; due on an earlier day, the alert is only resolved. An alert
 * already resolved (by an overlapping run) is skipped.
 */
const processAlert = (
  { task, alert }: DueAlert,
  today: string,
  systemOperatorId: number
): Effect.Effect<"processed" | "skipped", DbError | CustomerMissing, Db | Tx> =>
  Effect.gen(function* () {
    const customer = yield* lockCustomer(task.customerId)
    // Resolves the alert only if still open: an overlapping run may have
    // resolved it since the list was read
    const resolved = yield* query((client) =>
      client
        .update(alerts)
        .set({ isResolved: true, resolvedBy: systemOperatorId })
        .where(and(eq(alerts.id, alert.id), eq(alerts.isResolved, false)))
        .returning({ id: alerts.id })
    )
    if (resolved.length === 0) return "skipped"

    const alertResolvedLog = {
      customerId: customer.id,
      taskId: task.id,
      alertId: alert.id,
      actorOperatorId: systemOperatorId,
      action: "alert_resolved",
      source: "cron_alert",
    } as const

    if (italianDay(alert.deadline) === today) {
      // La nuova task attiva non deve nascere agganciata all'alert che stiamo
      // risolvendo: l'alert è risolto, quindi il contatto non ha più un alert
      // aperto e l'alert vive solo nello Storico, collegato (via alert.taskId)
      // alla vecchia task.
      yield* replaceActiveContact({
        customer,
        values: {
          state: "followup",
          closedAt: task.closedAt,
          operatorId: customer.operatorId,
          alertId: null,
          priority: 150,
          customPriority: false,
        },
      })
      yield* query((client) =>
        client.insert(taskEventLog).values([
          alertResolvedLog,
          {
            customerId: customer.id,
            taskId: task.id,
            actorOperatorId: systemOperatorId,
            action: "state_change",
            source: "cron_alert",
            fromState: task.state,
            toState: "followup",
          },
        ])
      )
    } else {
      // Only if the task still points at this alert: a writer may have linked
      // a new one since the list was read
      yield* query((client) =>
        client
          .update(tasks)
          .set({ alertId: null })
          .where(and(eq(tasks.id, task.id), eq(tasks.alertId, alert.id)))
      )
      yield* query((client) =>
        client.insert(taskEventLog).values(alertResolvedLog)
      )
    }
    return "processed"
  })

/**
 * The alert cron: resolves the open alerts due today or earlier, each in its
 * own transaction. An alert that fails is counted in `failed`, logged and
 * reported, and the others go on.
 *
 * Once `budgetMs` has passed since the start it takes no new alert, but always
 * takes the first: the ones left are counted in `remaining` and stay open for
 * the next call.
 */
export const processDueAlerts = (
  now: Date,
  { budgetMs }: { budgetMs: number }
): Effect.Effect<
  {
    found: number
    processed: number
    skipped: number
    failed: number
    remaining: number
  },
  DbError | SystemOperatorMissing,
  Db | ErrorReporter
> =>
  Effect.gen(function* () {
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
            sql`${alerts.id} IS NOT NULL`,
            sql`${deadlineDay} <= ${today}`
          )
        )
        // Today's first: taken on a later day, an alert counts as earlier-day
        // and gets no followup
        .orderBy(desc(alerts.deadline), asc(alerts.id))
    )
    const { succeeded, failed } = yield* forEachIsolated(
      rows,
      (row, index) =>
        Effect.gen(function* () {
          const elapsed = (yield* Clock.currentTimeMillis) - start
          if (index > 0 && elapsed >= budgetMs) return "remaining" as const
          return yield* transaction(processAlert(row, today, systemOperator.id))
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
  })
