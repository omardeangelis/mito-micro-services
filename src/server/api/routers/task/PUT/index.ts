import { operatorProcedure } from "@/server/api/trpc"
import { task } from "@/server/db/schema/task"
import { insertTaskSchema } from "@/lib/types/schemas"
import { eq } from "drizzle-orm"
import { z } from "zod"

const updateTaskInput = insertTaskSchema
  .pick({
    id: true,
    state: true,
    operatorId: true,
    isActive: true,
    alertId: true,
  })
  .extend({
    isClosed: z.boolean(),
  })

export const updateTask = operatorProcedure
  .input(updateTaskInput)
  .mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .update(task)
      .set({
        state: input.state,
        closedAt: input.isClosed ? new Date() : undefined,
        operatorId: input.operatorId,
        isActive: input.isActive,
        alertId: input.alertId,
      })
      .where(eq(task.id, input.id!))
      .returning()

    return res[0]
  })

const updateTaskFromDashboardInput = insertTaskSchema
  .pick({
    id: true,
    state: true,
    customPriority: true,
    priority: true,
    isActive: true,
    alertId: true,
  })
  .extend({
    isClosed: z.boolean().optional(),
  })

export const updateTaskFromDashboard = operatorProcedure
  .input(updateTaskFromDashboardInput)
  .mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .update(task)
      .set({
        state: input.state,
        priority: input.priority,
        customPriority: input.customPriority,
        closedAt: input.isClosed ? new Date() : undefined,
        isActive: input.isActive,
        alertId: input.alertId,
      })
      .where(eq(task.id, input.id!))
      .returning()

    return res[0]
  })
