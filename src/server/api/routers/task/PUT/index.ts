import { operatorProcedure } from "@/server/api/trpc"
import { task, taskStatus } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { insertTaskSchema } from "@/lib/types/schemas"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { runTrpc } from "@/server/effect/trpc"
import { actorOf } from "@/server/services/contact/actor"
import { changeState as changeStateService } from "@/server/services/contact/changeState"
import { contactErrorToTrpc } from "@/server/services/contact/errors"
import { setPriority as setPriorityService } from "@/server/services/contact/setPriority"
import { priorityBands } from "@/lib/domain/contact/priority"

const changeStateInput = z.object({
  taskId: z.number().int(),
  toState: z.enum(taskStatus),
  // Only the interface changes a state this way
  source: z.enum(["list", "detail"]),
  confirmedAlertId: z.number().int().nullable(),
})

/** The state change of a contact: see the `changeState` service. */
export const changeState = operatorProcedure
  .input(changeStateInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      changeStateService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )

const setPriorityInput = z.object({
  taskId: z.number().int(),
  priority: z.enum([...priorityBands, "auto"]),
})

/** The priority of a contact, by hand or back to the cron: see `setPriority`. */
export const setPriority = operatorProcedure
  .input(setPriorityInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      setPriorityService({ ...input, actor: actorOf(ctx.operator) }),
      contactErrorToTrpc
    )
  )

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
    const [before] = await ctx.db
      .select({ state: task.state })
      .from(task)
      .where(eq(task.id, input.id!))

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

    if (input.state && input.state !== before?.state) {
      await ctx.db.insert(taskEventLog).values({
        customerId: res[0]!.customerId!,
        taskId: input.id!,
        actorOperatorId: ctx.operator.id,
        action: "state_change",
        source: "list",
        fromState: before?.state ?? null,
        toState: input.state,
      })
    }

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
    const [before] = await ctx.db
      .select({ state: task.state })
      .from(task)
      .where(eq(task.id, input.id!))

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

    if (input.state && input.state !== before?.state) {
      await ctx.db.insert(taskEventLog).values({
        customerId: res[0]!.customerId!,
        taskId: input.id!,
        actorOperatorId: ctx.operator.id,
        action: "state_change",
        source: "detail",
        fromState: before?.state ?? null,
        toState: input.state,
      })
    }

    return res[0]
  })
