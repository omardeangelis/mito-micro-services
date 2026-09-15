import { insertCustomerSchema, selectAlertSchema } from "@/lib/types/schemas"
import { operatorProcedure } from "@/server/api/trpc"

import { alert, task } from "@/server/db/schema/task"
import { taskEventLog, taskEventSource } from "@/server/db/schema/taskEventLog"
import { eq } from "drizzle-orm"
import { z } from "zod"

const deleteTasksInput = insertCustomerSchema.pick({
  id: true,
})

export const deleteTasks = operatorProcedure
  .input(deleteTasksInput)
  .mutation(async ({ ctx, input }) => {
    const { id } = input
    return await ctx.db.delete(task).where(eq(task.customerId, id!))
  })

const resolveAlertsInput = selectAlertSchema
  .pick({ id: true })
  .extend({ source: z.enum(taskEventSource) })

// Nessun alert viene più cancellato (né dalle transizioni automatiche di
// stato né dalla "x" manuale): si sgancia sempre dalla task e si marca
// isResolved=true, conservando la riga. Chi/da dove finisce in
// alert.resolved_by + task_event_log (action='alert_resolved').
export const resolveAlerts = operatorProcedure
  .input(resolveAlertsInput)
  .mutation(async ({ ctx, input }) => {
    const { id, source } = input

    const [row] = await ctx.db
      .select({ taskId: alert.taskId, customerId: task.customerId })
      .from(alert)
      .innerJoin(task, eq(task.id, alert.taskId))
      .where(eq(alert.id, id))

    await ctx.db.update(task).set({ alertId: null }).where(eq(task.alertId, id))

    const result = await ctx.db
      .update(alert)
      .set({ isResolved: true, resolvedBy: ctx.operator.id })
      .where(eq(alert.id, id))

    await ctx.db.insert(taskEventLog).values({
      customerId: row!.customerId!,
      taskId: row!.taskId,
      alertId: id,
      actorOperatorId: ctx.operator.id,
      action: "alert_resolved",
      source,
    })

    return result
  })
