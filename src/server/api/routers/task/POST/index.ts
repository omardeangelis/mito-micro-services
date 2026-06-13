import { operatorProcedure } from "@/server/api/trpc"
import {
  insertTaskSchema,
  insertAlertSchema,
  type Task,
} from "@/lib/types/schemas"
import { alert, task, taskStatus } from "@/server/db/schema/task"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { and, eq, inArray, isNotNull, max, not } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"

const insertTaskInput = insertTaskSchema.pick({
  customerId: true,
  operatorId: true,
  state: true,
  closedAt: true,
})

export const createTask = operatorProcedure
  .input(insertTaskInput)
  .mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .insert(task)
      .values({
        customerId: input.customerId,
        operatorId: input.operatorId,
        // Rispetta lo stato richiesto invece di forzare sempre "chiamare":
        // così una "riapertura" verso uno stato specifico non viene azzerata.
        state: input.state ?? "chiamare",
        closedAt: input.closedAt,
        priority: 120,
        isActive: true,
      })
      .returning()

    return res[0]
  })

const bulkCreateTaskSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
  state: z.enum(taskStatus).default("chiamare"),
})

export const bulkHandleTask = operatorProcedure
  .input(bulkCreateTaskSchema)
  .mutation(async ({ ctx, input }) => {
    const customersActiveTasks = await ctx.db
      .select()
      .from(task)
      .where(
        and(
          inArray(task.customerId, input.customerIds),
          eq(task.isActive, true)
        )
      )

    const customerLookUpTable = customersActiveTasks.reduce(
      (acc, task) => {
        if (!acc[task.customerId!]) {
          acc[task.customerId!] = [task] as Task[]
          return acc
        }
        acc[task.customerId!]?.push(task)
        acc[task.customerId!]?.sort((a, b) => {
          if (a.updatedAt > b.updatedAt) {
            return -1
          }
          return 1
        })
        return acc
      },
      {} as Record<string, Task[]>
    )

    const customerWithActiveTaskIds = Object.keys(customerLookUpTable)
    const customersWithOnlyLastTaskMap = new Map<string, Task>()

    for (const customerId of customerWithActiveTaskIds) {
      customersWithOnlyLastTaskMap.set(
        customerId,
        customerLookUpTable[customerId]![0]!
      )
    }

    for (const customerId of input.customerIds) {
      if (!customersWithOnlyLastTaskMap.has(customerId)) {
        await ctx.db.insert(task).values({
          customerId,
          operatorId: input.operatorId,
          state: input.state,
          priority: 120,
          closedAt: null,
          isActive: true,
        })

        await ctx.db
          .update(customers)
          .set({ operatorId: input.operatorId })
          .where(eq(customers.id, customerId))
      } else {
        const customerTask = customersWithOnlyLastTaskMap.get(customerId)!
        if (
          customerTask.state !== "chiamare" &&
          customerTask.state !== "followup" &&
          // Non distruggere chi ha un alert pendente (callback pianificato):
          // per questi clienti riassegniamo solo l'operatore, preservando task e alert.
          !customerTask.alertId
        ) {
          const t = await ctx.db
            .update(task)
            .set({
              alertId: null,
            })
            .where(eq(task.id, customerTask.id))
            .returning({
              alertId: task.alertId,
              operatorId: task.operatorId,
            })

          if (t[0]?.alertId) {
            await ctx.db.delete(alert).where(eq(alert.id, t[0]?.alertId))
          }

          await ctx.db.insert(task).values({
            customerId,
            operatorId: input.operatorId,
            state: input.state,
            priority: 120,
            closedAt: customerTask.closedAt,
            isActive: true,
          })

          await ctx.db
            .update(task)
            .set({ isActive: false })
            .where(eq(task.id, customerTask.id))

          await ctx.db
            .update(customers)
            .set({ operatorId: input.operatorId })
            .where(eq(customers.id, customerId))
        } else {
          await ctx.db
            .update(task)
            .set({
              operatorId: input.operatorId,
            })
            .where(eq(task.id, customerTask.id))

          await ctx.db
            .update(customers)
            .set({ operatorId: input.operatorId })
            .where(eq(customers.id, customerId))
        }
      }
    }
  })

export const bulkCreateTask = operatorProcedure
  .input(bulkCreateTaskSchema)
  .mutation(async ({ ctx, input }) => {
    const customersActiveTasks = await ctx.db
      .select({
        customerId: task.customerId,
        lastDate: max(task.closedAt),
      })
      .from(task)
      .where(
        and(
          inArray(task.customerId, input.customerIds),
          eq(task.isActive, true)
        )
      )
      .groupBy(task.customerId)
    const valuesToInsert = input.customerIds.map((customerId) => ({
      customerId,
      operatorId: input.operatorId,
      state: input.state,
      closedAt:
        customersActiveTasks.find((tempC) => tempC.customerId === customerId)
          ?.lastDate ?? null,
      isActive: true,
    }))

    for (const activeTask of customersActiveTasks) {
      await ctx.db
        .update(task)
        .set({ isActive: false })
        .where(eq(task.customerId, activeTask.customerId!))
    }

    const res = await ctx.db.insert(task).values(valuesToInsert).returning()
    for (const customerId of input.customerIds) {
      await updateCustomerUpdatedAt({ id: customerId, db: ctx.db })
    }

    return res
  })

const insertAlertInput = insertAlertSchema.pick({
  taskId: true,
  message: true,
  deadline: true,
})

export const createAlert = operatorProcedure
  .input(insertAlertInput)
  .mutation(async ({ ctx, input }) => {
    const res = await ctx.db
      .insert(alert)
      .values({
        taskId: input.taskId,
        message: input.message,
        deadline: input.deadline,
      })
      .returning()

    const customerId = await ctx.db
      .update(task)
      .set({ alertId: res[0]!.id, state: "richiamare" })
      .where(eq(task.id, input.taskId))
      .returning({ customerID: task.customerId })

    if (customerId.length === 0) {
      const allCustomersAlert = await ctx.db
        .select({
          alertId: task.alertId,
        })
        .from(task)
        .where(
          and(
            eq(task.customerId, customerId[0]!.customerID!),
            isNotNull(task.alertId),
            not(eq(task.alertId, res[0]!.id))
          )
        )

      if (allCustomersAlert.length === 0) {
        await ctx.db
          .update(task)
          .set({ alertId: null, state: "richiamare" })
          .where(eq(task.customerId, customerId[0]!.customerID!))

        const alertsIds = allCustomersAlert.map(
          (alert) => alert.alertId
        ) as number[]

        await ctx.db.delete(alert).where(inArray(alert.id, alertsIds))
      }
    }

    return res[0]
  })
