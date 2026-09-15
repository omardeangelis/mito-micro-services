import { NextResponse } from "next/server"
import { loadEnv } from "@/lib/global/env"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { alert as alerts, task as tasks } from "@/server/db/schema/task"
import { customers } from "@/server/db/schema/customers"
import { operators } from "@/server/db/schema/operators"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { SYSTEM_OPERATOR_USER_ID } from "@/lib/constants/operator"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    const [systemOperator] = await db
      .select({ id: operators.id })
      .from(operators)
      .where(eq(operators.userId, SYSTEM_OPERATOR_USER_ID))
    const systemOperatorId = systemOperator!.id

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayFormatted = formatDate(today)

    const result = await db
      .select({
        task: tasks,
        alert: alerts,
      })
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

    if (result.length === 0) {
      return NextResponse.json({ message: "No alerts to process" })
    }

    for (const row of result) {
      const { task, alert } = row
      const alertDeadline = alert.deadline

      // Set both dates to 10 AM, adding 1 hour to deadline first
      const normalizedToday = new Date(today)
      normalizedToday.setHours(10, 0, 0, 0)
      const normalizedDeadline = new Date(alertDeadline)
      normalizedDeadline.setHours(normalizedDeadline.getHours() + 1) // Add 1 hour
      normalizedDeadline.setHours(10, 0, 0, 0)

      console.log("normalizedToday", normalizedToday)
      console.log("normalizedDeadline", normalizedDeadline)

      // Use normalized dates for comparison
      if (normalizedToday.getTime() === normalizedDeadline.getTime()) {
        const customer = await db
          .select()
          .from(customers)
          .where(eq(customers.id, task!.customerId!))
        const updatedOperatorId = customer[0]!.operatorId

        // La nuova task attiva non deve nascere agganciata all'alert che stiamo
        // risolvendo qui sotto: altrimenti getActiveAlerts lo ripesca e lo mostra
        // in "Attivo" come scaduto, duplicandolo con lo Storico. L'alert resta
        // collegato (via alert.taskId) alla vecchia task per lo storico.
        await db.insert(tasks).values({
          state: "followup",
          closedAt: task?.closedAt,
          customerId: task?.customerId,
          operatorId: updatedOperatorId,
          alertId: null,
          priority: 150,
          customPriority: false,
          isActive: true,
        })

        await db
          .update(tasks)
          .set({ isActive: false })
          .where(eq(tasks.id, task!.id))

        await db
          .update(alerts)
          .set({ isResolved: true, resolvedBy: systemOperatorId })
          .where(eq(alerts.id, alert.id))

        // await db.delete(alerts).where(eq(alerts.id, alert.id))

        await db.insert(taskEventLog).values([
          {
            customerId: task!.customerId!,
            taskId: task!.id,
            alertId: alert.id,
            actorOperatorId: systemOperatorId,
            action: "alert_resolved",
            source: "cron_alert",
          },
          {
            customerId: task!.customerId!,
            taskId: task!.id,
            actorOperatorId: systemOperatorId,
            action: "state_change",
            source: "cron_alert",
            fromState: task!.state,
            toState: "followup",
          },
        ])
      } else {
        await db
          .update(tasks)
          .set({ alertId: null })
          .where(eq(tasks.id, task!.id))

        // remove the alert from the database
        // await db.delete(alerts).where(eq(alerts.id, alert.id))
        await db
          .update(alerts)
          .set({ isResolved: true, resolvedBy: systemOperatorId })
          .where(eq(alerts.id, alert.id))

        await db.insert(taskEventLog).values({
          customerId: task!.customerId!,
          taskId: task!.id,
          alertId: alert.id,
          actorOperatorId: systemOperatorId,
          action: "alert_resolved",
          source: "cron_alert",
        })
      }
    }

    return NextResponse.json({ message: "Cron job ran" })
  } catch (error) {
    console.error("Error deleting export files", error)
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }
}

// Path: src/app/api/cron.ts

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0") // Mesi partono da 0
  const day = String(date.getDate()).padStart(2, "0")
  const hours = "00"
  const minutes = "00"
  const seconds = "00"

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
