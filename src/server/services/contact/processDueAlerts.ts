import "server-only"
import { Data, Effect } from "effect"
import { and, eq, sql } from "drizzle-orm"
import { SYSTEM_OPERATOR_USER_ID } from "@/lib/constants/operator"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { alert as alerts, task as tasks } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  CustomerMissing,
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

type DueAlert = {
  task: typeof tasks.$inferSelect
  alert: typeof alerts.$inferSelect
}

// Dates are compared in the server's time zone (UTC on Vercel), as always

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0") // Mesi partono da 0
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day} 00:00:00`
}

/** Whether the alert falls due today, rather than on an earlier day. */
function isDueToday(deadline: Date, today: Date) {
  // Set both dates to 10 AM, adding 1 hour to deadline first
  const normalizedToday = new Date(today)
  normalizedToday.setHours(10, 0, 0, 0)
  const normalizedDeadline = new Date(deadline)
  normalizedDeadline.setHours(normalizedDeadline.getHours() + 1)
  normalizedDeadline.setHours(10, 0, 0, 0)
  return normalizedToday.getTime() === normalizedDeadline.getTime()
}

/**
 * Resolves one alert. Due today, the customer gets a `followup` contact for
 * its operator; due on an earlier day, the alert is only resolved. An alert
 * already resolved (by an overlapping run) is skipped.
 */
const processAlert = (
  { task, alert }: DueAlert,
  today: Date,
  systemOperatorId: number
): Effect.Effect<"processed" | "skipped", DbError | CustomerMissing, Db | Tx> =>
  Effect.gen(function* () {
    // Lock order: customer, then its tasks and alerts
    const customerId = yield* lockCustomer(task.customerId)
    const [current] = yield* query((client) =>
      client
        .select({ isResolved: alerts.isResolved })
        .from(alerts)
        .where(eq(alerts.id, alert.id))
        .for("update")
    )
    if (!current || current.isResolved) return "skipped"

    const resolveAlert = query((client) =>
      client
        .update(alerts)
        .set({ isResolved: true, resolvedBy: systemOperatorId })
        .where(eq(alerts.id, alert.id))
    )
    const alertResolvedLog = {
      customerId,
      taskId: task.id,
      alertId: alert.id,
      actorOperatorId: systemOperatorId,
      action: "alert_resolved",
      source: "cron_alert",
    } as const

    if (isDueToday(alert.deadline, today)) {
      const [customer] = yield* query((client) =>
        client
          .select({ operatorId: customers.operatorId })
          .from(customers)
          .where(eq(customers.id, customerId))
      )
      if (!customer) return yield* new CustomerMissing({ customerId })

      // La nuova task attiva non deve nascere agganciata all'alert che stiamo
      // risolvendo qui sotto: altrimenti getActiveAlerts lo ripesca e lo mostra
      // in "Attivo" come scaduto, duplicandolo con lo Storico. L'alert resta
      // collegato (via alert.taskId) alla vecchia task per lo storico.
      yield* replaceActiveContact({
        customerId,
        values: {
          state: "followup",
          closedAt: task.closedAt,
          operatorId: customer.operatorId,
          alertId: null,
          priority: 150,
          customPriority: false,
        },
      })
      yield* resolveAlert
      yield* query((client) =>
        client.insert(taskEventLog).values([
          alertResolvedLog,
          {
            customerId,
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
      yield* query((client) =>
        client.update(tasks).set({ alertId: null }).where(eq(tasks.id, task.id))
      )
      yield* resolveAlert
      yield* query((client) =>
        client.insert(taskEventLog).values(alertResolvedLog)
      )
    }
    return "processed"
  })

/**
 * The alert cron: resolves every open alert due today or earlier, each in its
 * own transaction. An alert that fails is counted in `failed`, logged and
 * reported, and the others go on.
 */
export const processDueAlerts = (
  now: Date
): Effect.Effect<
  { found: number; processed: number; skipped: number; failed: number },
  DbError | SystemOperatorMissing,
  Db | ErrorReporter
> =>
  Effect.gen(function* () {
    const [systemOperator] = yield* query((client) =>
      client
        .select({ id: operators.id })
        .from(operators)
        .where(eq(operators.userId, SYSTEM_OPERATOR_USER_ID))
    )
    if (!systemOperator) return yield* new SystemOperatorMissing()

    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const todayFormatted = formatDate(today)

    const rows = yield* query((client) =>
      client
        .select({ task: tasks, alert: alerts })
        .from(alerts)
        .leftJoin(tasks, eq(alerts.id, tasks.alertId))
        .where(
          and(
            eq(alerts.isResolved, false),
            eq(alerts.taskId, tasks.id),
            sql`${alerts.id} IS NOT NULL`,
            sql`DATE(${alerts.deadline}) <= ${todayFormatted}`
          )
        )
    )
    // The WHERE clause makes it an inner join
    const dueAlerts = rows.flatMap(({ task, alert }) =>
      task ? [{ task, alert }] : []
    )

    const { succeeded, failed } = yield* forEachIsolated(
      dueAlerts,
      (row) => transaction(processAlert(row, today, systemOperator.id)),
      ({ task, alert }) => ({ alertId: alert.id, customerId: task.customerId })
    )
    const skipped = succeeded.filter((outcome) => outcome === "skipped").length
    return {
      found: rows.length,
      processed: succeeded.length - skipped,
      skipped,
      failed,
    }
  })
