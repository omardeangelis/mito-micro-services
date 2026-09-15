import { operatorProcedure } from "@/server/api/trpc"
import {
  insertTaskSchema,
  insertAlertSchema,
  type Task,
} from "@/lib/types/schemas"
import { alert, task, taskStatus } from "@/server/db/schema/task"
import { taskEventLog, taskEventSource } from "@/server/db/schema/taskEventLog"
import { z } from "zod"
import { updateCustomerUpdatedAt } from "@/server/shared/updateAt"
import { and, eq, inArray, isNotNull, max, not } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"

const insertTaskInput = insertTaskSchema
  .pick({
    customerId: true,
    operatorId: true,
    state: true,
    closedAt: true,
  })
  .extend({
    source: z.enum(taskEventSource),
  })

export const createTask = operatorProcedure
  .input(insertTaskInput)
  .mutation(async ({ ctx, input }) => {
    const [previousActive] = await ctx.db
      .select({ state: task.state })
      .from(task)
      .where(
        and(eq(task.customerId, input.customerId!), eq(task.isActive, true))
      )

    const toState = input.state ?? "chiamare"

    const res = await ctx.db
      .insert(task)
      .values({
        customerId: input.customerId,
        operatorId: input.operatorId,
        // Rispetta lo stato richiesto invece di forzare sempre "chiamare":
        // così una "riapertura" verso uno stato specifico non viene azzerata.
        state: toState,
        closedAt: input.closedAt,
        priority: 120,
        isActive: true,
      })
      .returning()

    await ctx.db.insert(taskEventLog).values({
      customerId: input.customerId!,
      taskId: res[0]!.id,
      actorOperatorId: ctx.operator.id,
      action: "state_change",
      source: input.source,
      fromState: previousActive?.state ?? null,
      toState,
    })

    return res[0]
  })

const bulkCreateTaskSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
  state: z.enum(taskStatus).default("chiamare"),
})

// bulkHandleTask accetta, in più, l'elenco dei clienti per cui l'operatore ha
// confermato esplicitamente la rimozione dell'alert pendente. Per tutti gli altri
// l'alert/callback viene preservato.
const bulkHandleTaskSchema = bulkCreateTaskSchema.extend({
  resolveAlertCustomerIds: z.array(z.string()).optional().default([]),
})

export const bulkHandleTask = operatorProcedure
  .input(bulkHandleTaskSchema)
  .mutation(async ({ ctx, input }) => {
    const customersBeforeUpdate = await ctx.db
      .select({ id: customers.id, operatorId: customers.operatorId })
      .from(customers)
      .where(inArray(customers.id, input.customerIds))
    const customerOperatorBeforeMap = new Map(
      customersBeforeUpdate.map((c) => [c.id, c.operatorId])
    )

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

    const resolveAlertSet = new Set(input.resolveAlertCustomerIds)

    for (const customerId of input.customerIds) {
      if (!customersWithOnlyLastTaskMap.has(customerId)) {
        const [insertedTask] = await ctx.db
          .insert(task)
          .values({
            customerId,
            operatorId: input.operatorId,
            state: input.state,
            priority: 120,
            closedAt: null,
            isActive: true,
          })
          .returning({ id: task.id })

        await ctx.db
          .update(customers)
          .set({ operatorId: input.operatorId })
          .where(eq(customers.id, customerId))

        const fromOperatorId = customerOperatorBeforeMap.get(customerId) ?? null
        const logRows: (typeof taskEventLog.$inferInsert)[] = [
          {
            customerId,
            taskId: insertedTask!.id,
            actorOperatorId: ctx.operator.id,
            action: "state_change",
            source: "bulk",
            fromState: null,
            toState: input.state,
          },
        ]
        if (fromOperatorId !== input.operatorId) {
          logRows.push({
            customerId,
            taskId: insertedTask!.id,
            actorOperatorId: ctx.operator.id,
            action: "operator_reassign",
            source: "bulk",
            fromOperatorId,
            toOperatorId: input.operatorId,
          })
        }
        await ctx.db.insert(taskEventLog).values(logRows)
      } else {
        const customerTask = customersWithOnlyLastTaskMap.get(customerId)!

        if (customerTask.alertId && resolveAlertSet.has(customerId)) {
          // L'operatore ha confermato la rimozione dell'alert per questo cliente:
          // lo risolviamo in modo NON distruttivo (isResolved=true, record conservato,
          // il cron non lo riattiva) e creiamo una nuova chiamata con lo stato richiesto.
          await ctx.db
            .update(alert)
            .set({ isResolved: true, resolvedBy: ctx.operator.id })
            .where(eq(alert.id, customerTask.alertId))

          await ctx.db
            .update(task)
            .set({ alertId: null, isActive: false })
            .where(eq(task.id, customerTask.id))

          const [reopenedTask] = await ctx.db
            .insert(task)
            .values({
              customerId,
              operatorId: input.operatorId,
              state: input.state,
              priority: 120,
              closedAt: customerTask.closedAt,
              isActive: true,
            })
            .returning({ id: task.id })

          await ctx.db
            .update(customers)
            .set({ operatorId: input.operatorId })
            .where(eq(customers.id, customerId))

          const logRows: (typeof taskEventLog.$inferInsert)[] = [
            {
              customerId,
              taskId: customerTask.id,
              alertId: customerTask.alertId,
              actorOperatorId: ctx.operator.id,
              action: "alert_resolved",
              source: "bulk",
            },
          ]
          if (input.state !== customerTask.state) {
            logRows.push({
              customerId,
              taskId: reopenedTask!.id,
              actorOperatorId: ctx.operator.id,
              action: "state_change",
              source: "bulk",
              fromState: customerTask.state,
              toState: input.state,
            })
          }
          if (customerTask.operatorId !== input.operatorId) {
            logRows.push({
              customerId,
              taskId: reopenedTask!.id,
              actorOperatorId: ctx.operator.id,
              action: "operator_reassign",
              source: "bulk",
              fromOperatorId: customerTask.operatorId,
              toOperatorId: input.operatorId,
            })
          }
          await ctx.db.insert(taskEventLog).values(logRows)
        } else if (
          customerTask.state !== "chiamare" &&
          customerTask.state !== "followup" &&
          // Non distruggere chi ha un alert pendente (callback pianificato): per
          // questi clienti riassegniamo solo l'operatore, preservando task e alert.
          // La rimozione avviene solo su conferma esplicita (ramo sopra).
          !customerTask.alertId
        ) {
          const [newTask] = await ctx.db
            .insert(task)
            .values({
              customerId,
              operatorId: input.operatorId,
              state: input.state,
              priority: 120,
              closedAt: customerTask.closedAt,
              isActive: true,
            })
            .returning({ id: task.id })

          await ctx.db
            .update(task)
            .set({ isActive: false })
            .where(eq(task.id, customerTask.id))

          await ctx.db
            .update(customers)
            .set({ operatorId: input.operatorId })
            .where(eq(customers.id, customerId))

          const logRows: (typeof taskEventLog.$inferInsert)[] = []
          if (input.state !== customerTask.state) {
            logRows.push({
              customerId,
              taskId: newTask!.id,
              actorOperatorId: ctx.operator.id,
              action: "state_change",
              source: "bulk",
              fromState: customerTask.state,
              toState: input.state,
            })
          }
          if (customerTask.operatorId !== input.operatorId) {
            logRows.push({
              customerId,
              taskId: newTask!.id,
              actorOperatorId: ctx.operator.id,
              action: "operator_reassign",
              source: "bulk",
              fromOperatorId: customerTask.operatorId,
              toOperatorId: input.operatorId,
            })
          }
          if (logRows.length > 0) {
            await ctx.db.insert(taskEventLog).values(logRows)
          }
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

          if (customerTask.operatorId !== input.operatorId) {
            await ctx.db.insert(taskEventLog).values({
              customerId,
              taskId: customerTask.id,
              actorOperatorId: ctx.operator.id,
              action: "operator_reassign",
              source: "bulk",
              fromOperatorId: customerTask.operatorId,
              toOperatorId: input.operatorId,
            })
          }
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
