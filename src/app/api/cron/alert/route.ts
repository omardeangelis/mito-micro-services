import { NextResponse } from "next/server"
import { loadEnv } from "@/lib/global/env"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/server/db"
import { alert as alerts, task as tasks } from "@/server/db/schema/task"
import { customers } from "@/server/db/schema/customers"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
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

        await db.insert(tasks).values({
          state: "followup",
          closedAt: task?.closedAt,
          customerId: task?.customerId,
          operatorId: updatedOperatorId,
          alertId: alert.id,
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
          .set({ isResolved: true })
          .where(eq(alerts.id, alert.id))

        // await db.delete(alerts).where(eq(alerts.id, alert.id))
      } else {
        await db
          .update(tasks)
          .set({ alertId: null })
          .where(eq(tasks.id, task!.id))

        // remove the alert from the database
        // await db.delete(alerts).where(eq(alerts.id, alert.id))
        await db
          .update(alerts)
          .set({ isResolved: true })
          .where(eq(alerts.id, alert.id))
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
