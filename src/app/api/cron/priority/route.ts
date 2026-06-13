import { type NextRequest, NextResponse } from "next/server"
import { loadEnv } from "@/lib/global/env"
import { and, eq, not } from "drizzle-orm"
import { db } from "@/server/db"
import { alert as alerts, task } from "@/server/db/schema/task"
import { practices as practice } from "@/server/db/schema/pratiche"
import { customerToPratica } from "@/server/db/schema/relations/customerToPratica"
import { calculatePriority, type TaskPriority } from "@/lib/utils/priority"
import { splitArray } from "../../import/_utils"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

type CronRequest = {
  id?: number
}

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck(req)
  if (authResponse) return authResponse

  try {
    let id = null
    if (req.method === "POST") {
      const request = (await req.json()) as CronRequest
      id = request.id
    }

    if (id) {
      const tasks = await db
        .select({
          id: task.id,
          state: task.state,
          deadline: alerts.deadline,
          customerId: task.customerId,
          closedAt: task.closedAt,
          customPriority: task.customPriority,
        })
        .from(task)
        .leftJoin(alerts, eq(task.alertId, alerts.id))
        .where(
          and(
            eq(task.id, Number(id)),
            not(and(eq(task.state, "chiamare"), eq(task.priority, 120))!),
            eq(task.customPriority, false)
          )
        )
      await updateTaskPriority(tasks as TaskPriority[])
    } else {
      const tasks = await db
        .select({
          id: task.id,
          state: task.state,
          deadline: alerts.deadline,
          customerId: task.customerId,
          closedAt: task.closedAt,
          customPriority: task.customPriority,
        })
        .from(task)
        .leftJoin(alerts, eq(task.alertId, alerts.id))
        .where(
          and(
            not(and(eq(task.state, "chiamare"), eq(task.priority, 120))!),
            eq(task.customPriority, false)
          )
        )

      await updateTaskPriority(tasks as TaskPriority[])
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

const updateTaskPriority = async (
  tasks: Omit<TaskPriority[], "dataLiquidazione">
) => {
  if (tasks.length === 0) {
    return NextResponse.error()
  }

  const practices = await db
    .select({
      id: practice.praticaId,
      dataLiquidazione: practice.dataLiquidazione,
    })
    .from(customerToPratica)
    .leftJoin(practice, eq(customerToPratica.praticaId, practice.praticaId))
    .where(eq(customerToPratica.customerId, tasks[0]!.customerId))
    .groupBy(customerToPratica.praticaId, practice.praticaId)

  const newTasks = tasks.map((task) => {
    let dataLiquidazione = null
    if (practices.length > 0) {
      const newPractices = practices.sort((a, b) => {
        return a.dataLiquidazione! > b.dataLiquidazione! ? -1 : 1
      })
      dataLiquidazione = newPractices[0]!.dataLiquidazione
    }
    return {
      ...task,
      customerId: tasks[0]!.customerId,
      customPriority: tasks[0]!.customPriority,
      dataLiquidazione: dataLiquidazione,
    }
  })

  const taskPromiseArray = []
  for (const t of newTasks) {
    const priority = calculatePriority(t)
    taskPromiseArray.push(
      db.update(task).set({ priority }).where(eq(task.id, t.id))
    )
  }

  for await (const taskPromise of splitArray(taskPromiseArray, 100)) {
    await Promise.all(taskPromise)
  }
}

async function postHandler(req: NextRequest) {
  return await handler(req)
}

export { handler as GET, postHandler as POST }
