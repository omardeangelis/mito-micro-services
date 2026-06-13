import { operatorProcedure } from "@/server/api/trpc"
import { alert, task } from "@/server/db/schema/task"
import { desc, eq, and, sql } from "drizzle-orm"
import { selectCustomerSchema, selectTaskSchema } from "@/lib/types/schemas"

const taskInput = selectTaskSchema.pick({
  id: true,
})

export const getTaskById = operatorProcedure
  .input(taskInput)
  .query(async ({ ctx, input }) => {
    const { id } = input
    return await ctx.db.select().from(task).where(eq(task.id, id))
  })

export const getTasksToExport = operatorProcedure.query(async ({ ctx }) => {
  const { db, operator } = ctx
  const isAdmin = operator.role === "ADMIN"
  if (isAdmin) {
    const tasks = await db.select().from(task).orderBy(desc(task.updatedAt))
    if (tasks.length === 0) {
      return false
    }
    return true
  } else {
    const tasks = await db
      .select()
      .from(task)
      .where(eq(task.operatorId, operator.id))
      .orderBy(desc(task.updatedAt))

    if (tasks.length === 0) {
      return false
    }
    return true
  }
})

export const getAllAvaibleTaskStatus = operatorProcedure.query(
  async ({ ctx }) => {
    const { db } = ctx
    return await db
      .selectDistinct({ state: task.state })
      .from(task)
      .groupBy(task.state)
  }
)

const getActiveAlertsInput = selectTaskSchema.pick({ alertId: true })

export const getActiveAlerts = operatorProcedure
  .input(getActiveAlertsInput)
  .query(async ({ ctx, input }) => {
    const { alertId } = input
    const alerts = alertId
      ? await ctx.db.select().from(alert).where(eq(alert.id, alertId))
      : []

    const lastAlertId = await ctx.db
      .select()
      .from(alert)
      .orderBy(desc(alert.id))
      .limit(1)

    return {
      alerts: alerts[0],
      lastAlertId: lastAlertId[0]?.id ?? 0,
    }
  })

const getActiveTaskInput = selectCustomerSchema.pick({
  id: true,
})

export const getActiveTask = operatorProcedure
  .input(getActiveTaskInput)
  .query(async ({ ctx, input }) => {
    const { db } = ctx
    // NB: un cliente può avere più task con isActive=true (bug noto sui duplicati).
    // Ordiniamo in modo deterministico e prendiamo SOLO la più recente, così tutti i
    // componenti che leggono la "task attiva" mostrano la stessa riga e non pescano
    // un [0] casuale. GREATEST(updatedAt, createdAt) = ultima volta che la riga è stata
    // toccata: è robusto anche rispetto al default congelato di updatedAt (le righe
    // realmente modificate hanno una data reale, quelle auto-create no).
    return await db
      .select()
      .from(task)
      .where(and(eq(task.isActive, true), eq(task.customerId, input.id)))
      .orderBy(
        desc(sql`GREATEST(${task.updatedAt}, ${task.createdAt})`),
        desc(task.id)
      )
      .limit(1)
  })
