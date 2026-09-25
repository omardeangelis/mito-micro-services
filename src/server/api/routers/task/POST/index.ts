import { TRPCError } from "@trpc/server"
import { Effect } from "effect"
import { operatorProcedure } from "@/server/api/trpc"
import {
  insertTaskSchema,
  insertAlertSchema,
  type Task,
} from "@/lib/types/schemas"
import { alert, task, taskStatus } from "@/server/db/schema/task"
import { taskEventLog, taskEventSource } from "@/server/db/schema/taskEventLog"
import { z } from "zod"
import { and, eq, inArray, isNotNull, not } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import { lockCustomer, query, transaction } from "@/server/effect/db"
import { runTrpc } from "@/server/effect/trpc"
import { replaceActiveContact } from "@/server/services/contact/activeContact"

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
  .mutation(({ ctx, input }) =>
    runTrpc(
      transaction(
        Effect.gen(function* () {
          const toState = input.state ?? "chiamare"
          // Deactivates the customer's active task: a customer never keeps two
          const { created, previous } = yield* replaceActiveContact({
            customerId: input.customerId ?? null,
            values: {
              operatorId: input.operatorId,
              // Rispetta lo stato richiesto invece di forzare sempre "chiamare":
              // così una "riapertura" verso uno stato specifico non viene azzerata.
              state: toState,
              closedAt: input.closedAt,
              priority: 120,
            },
          })
          yield* query((client) =>
            client.insert(taskEventLog).values({
              customerId: created.customerId!,
              taskId: created.id,
              actorOperatorId: ctx.operator.id,
              action: "state_change",
              source: input.source,
              fromState: previous?.state ?? null,
              toState,
            })
          )
          return created
        })
      ),
      (error) =>
        new TRPCError({
          code: "BAD_REQUEST",
          message: `Cliente non trovato: ${error.customerId}`,
        })
    )
  )

// resolveAlertCustomerIds: l'elenco dei clienti per cui l'operatore ha
// confermato esplicitamente la rimozione dell'alert pendente. Per tutti gli altri
// l'alert/callback viene preservato.
const bulkHandleTaskSchema = z.object({
  operatorId: z.number(),
  customerIds: z.array(z.string()),
  state: z.enum(taskStatus).default("chiamare"),
  resolveAlertCustomerIds: z.array(z.string()).optional().default([]),
})

type BulkHandleTaskInput = z.infer<typeof bulkHandleTaskSchema>
type LogRow = typeof taskEventLog.$inferInsert

const insertLogRows = (rows: LogRow[]) =>
  rows.length === 0
    ? Effect.void
    : query((client) => client.insert(taskEventLog).values(rows))

/**
 * Assigns one customer, in its own transaction, following the four cases of
 * the operators' guide (brain/chore/crm/guida-assegnazione-massiva-e-alert.md).
 * `customerTask` is its active task read before the transactions started;
 * `resolveAlert` says whether the actor confirmed closing its alert.
 */
const assignCustomer = ({
  input,
  customerId,
  customerTask,
  resolveAlert,
  operatorBefore,
  actorOperatorId,
}: {
  input: BulkHandleTaskInput
  customerId: string
  customerTask: Task | undefined
  resolveAlert: boolean
  operatorBefore: number | null
  actorOperatorId: number
}) =>
  Effect.gen(function* () {
    // Lock order: customer, then its tasks, then its alerts
    yield* lockCustomer(customerId)
    const setCustomerOperator = query((client) =>
      client
        .update(customers)
        .set({ operatorId: input.operatorId })
        .where(eq(customers.id, customerId))
    )
    const newContact = (closedAt: Date | null) =>
      replaceActiveContact({
        customerId,
        values: {
          operatorId: input.operatorId,
          state: input.state,
          priority: 120,
          closedAt,
        },
      })
    const stateChange = (taskId: number, fromState: Task["state"]): LogRow => ({
      customerId,
      taskId,
      actorOperatorId,
      action: "state_change",
      source: "bulk",
      fromState,
      toState: input.state,
    })
    const operatorReassign = (
      taskId: number,
      fromOperatorId: number | null
    ): LogRow => ({
      customerId,
      taskId,
      actorOperatorId,
      action: "operator_reassign",
      source: "bulk",
      fromOperatorId,
      toOperatorId: input.operatorId,
    })

    if (!customerTask) {
      const { created } = yield* newContact(null)
      yield* setCustomerOperator
      yield* insertLogRows([
        stateChange(created.id, null),
        ...(operatorBefore !== input.operatorId
          ? [operatorReassign(created.id, operatorBefore)]
          : []),
      ])
      return
    }

    if (customerTask.alertId && resolveAlert) {
      // L'operatore ha confermato la rimozione dell'alert per questo cliente:
      // lo risolviamo in modo NON distruttivo (isResolved=true, record conservato,
      // il cron non lo riattiva) e creiamo una nuova chiamata con lo stato richiesto.
      const alertId = customerTask.alertId
      const { created } = yield* newContact(customerTask.closedAt)
      yield* query((client) =>
        client
          .update(task)
          .set({ alertId: null })
          .where(eq(task.id, customerTask.id))
      )
      yield* query((client) =>
        client
          .update(alert)
          .set({ isResolved: true, resolvedBy: actorOperatorId })
          .where(eq(alert.id, alertId))
      )
      yield* setCustomerOperator
      yield* insertLogRows([
        {
          customerId,
          taskId: customerTask.id,
          alertId,
          actorOperatorId,
          action: "alert_resolved",
          source: "bulk",
        },
        ...(input.state !== customerTask.state
          ? [stateChange(created.id, customerTask.state)]
          : []),
        ...(customerTask.operatorId !== input.operatorId
          ? [operatorReassign(created.id, customerTask.operatorId)]
          : []),
      ])
      return
    }

    if (
      customerTask.state !== "chiamare" &&
      customerTask.state !== "followup" &&
      // Non distruggere chi ha un alert pendente (callback pianificato): per
      // questi clienti riassegniamo solo l'operatore, preservando task e alert.
      // La rimozione avviene solo su conferma esplicita (ramo sopra).
      !customerTask.alertId
    ) {
      const { created } = yield* newContact(customerTask.closedAt)
      yield* setCustomerOperator
      yield* insertLogRows([
        ...(input.state !== customerTask.state
          ? [stateChange(created.id, customerTask.state)]
          : []),
        ...(customerTask.operatorId !== input.operatorId
          ? [operatorReassign(created.id, customerTask.operatorId)]
          : []),
      ])
      return
    }

    yield* query((client) =>
      client
        .update(task)
        .set({ operatorId: input.operatorId })
        .where(eq(task.id, customerTask.id))
    )
    yield* setCustomerOperator
    if (customerTask.operatorId !== input.operatorId) {
      yield* insertLogRows([
        operatorReassign(customerTask.id, customerTask.operatorId),
      ])
    }
  })

export const bulkHandleTask = operatorProcedure
  .input(bulkHandleTaskSchema)
  .mutation(({ ctx, input }) =>
    runTrpc(
      Effect.gen(function* () {
        const customersBeforeUpdate = yield* query((client) =>
          client
            .select({ id: customers.id, operatorId: customers.operatorId })
            .from(customers)
            .where(inArray(customers.id, input.customerIds))
        )
        const customerOperatorBeforeMap = new Map(
          customersBeforeUpdate.map((c) => [c.id, c.operatorId])
        )

        const customersActiveTasks = yield* query((client) =>
          client
            .select()
            .from(task)
            .where(
              and(
                inArray(task.customerId, input.customerIds),
                eq(task.isActive, true)
              )
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

        const resolveAlertSet = new Set(input.resolveAlertCustomerIds)

        // One transaction per customer, in the order given. The first failure
        // stops the run; the customers before it stay assigned.
        yield* Effect.forEach(
          input.customerIds,
          (customerId) =>
            transaction(
              assignCustomer({
                input,
                customerId,
                customerTask: customerLookUpTable[customerId]?.[0],
                resolveAlert: resolveAlertSet.has(customerId),
                operatorBefore:
                  customerOperatorBeforeMap.get(customerId) ?? null,
                actorOperatorId: ctx.operator.id,
              })
            ),
          { concurrency: 1, discard: true }
        )
      }),
      (error) =>
        new TRPCError({
          code: "BAD_REQUEST",
          message: `Cliente non trovato: ${error.customerId}`,
        })
    )
  )

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
