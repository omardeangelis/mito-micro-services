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
import { and, desc, eq, inArray, isNotNull, not } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import {
  type CustomerMissing,
  lockCustomer,
  query,
  transaction,
} from "@/server/effect/db"
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

/** `CustomerMissing` as tRPC reports it: the input names no customer. */
const customerNotFound = (error: CustomerMissing) =>
  new TRPCError({
    code: "BAD_REQUEST",
    message: `Cliente non trovato: ${error.customerId}`,
  })

export const createTask = operatorProcedure
  .input(insertTaskInput)
  .mutation(({ ctx, input }) =>
    runTrpc(
      transaction(
        Effect.gen(function* () {
          const toState = input.state ?? "chiamare"
          const customer = yield* lockCustomer(input.customerId ?? null)
          // Deactivates the customer's active task: a customer never keeps two
          const { created, previous } = yield* replaceActiveContact({
            customer,
            values: {
              operatorId: input.operatorId,
              // Rispetta lo stato richiesto invece di forzare sempre "chiamare":
              // così una "riapertura" verso uno stato specifico non viene azzerata.
              state: toState,
              closedAt: input.closedAt,
              priority: 120,
            },
            // As at base, where the insert was the only write
            mostRecent: true,
          })
          yield* query((client) =>
            client.insert(taskEventLog).values({
              customerId: created.customerId,
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
      customerNotFound
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

type LogRow = typeof taskEventLog.$inferInsert

/**
 * Assigns one customer, in its own transaction, following the four cases of
 * the operators' guide (brain/chore/crm/guida-assegnazione-massiva-e-alert.md).
 * The case is decided on the data read after the customer is locked.
 */
const assignCustomer = ({
  customerId,
  operatorId,
  state,
  resolveAlert,
  actorOperatorId,
}: {
  customerId: string
  operatorId: number
  state: Task["state"]
  /** The actor confirmed closing the customer's open alert */
  resolveAlert: boolean
  actorOperatorId: number
}) =>
  Effect.gen(function* () {
    const customer = yield* lockCustomer(customerId)
    // With more than one active task, the most recently updated one
    const [customerTask] = yield* query((client) =>
      client
        .select()
        .from(task)
        .where(and(eq(task.customerId, customerId), eq(task.isActive, true)))
        .orderBy(desc(task.updatedAt), desc(task.id))
        .limit(1)
    )

    const stateChange = (taskId: number, fromState: Task["state"]): LogRow[] =>
      fromState === state
        ? []
        : [
            {
              customerId,
              taskId,
              actorOperatorId,
              action: "state_change",
              source: "bulk",
              fromState,
              toState: state,
            },
          ]
    const operatorReassign = (
      taskId: number,
      fromOperatorId: number | null
    ): LogRow[] =>
      fromOperatorId === operatorId
        ? []
        : [
            {
              customerId,
              taskId,
              actorOperatorId,
              action: "operator_reassign",
              source: "bulk",
              fromOperatorId,
              toOperatorId: operatorId,
            },
          ]
    const insertLogRows = (rows: LogRow[]) =>
      rows.length === 0
        ? Effect.void
        : query((client) => client.insert(taskEventLog).values(rows))
    const setCustomerOperator = query((client) =>
      client
        .update(customers)
        .set({ operatorId })
        .where(eq(customers.id, customerId))
    )

    // 1. No active contact: a new one
    if (!customerTask) {
      const { created } = yield* replaceActiveContact({
        customer,
        values: { operatorId, state, priority: 120, closedAt: null },
      })
      yield* setCustomerOperator
      yield* insertLogRows([
        ...stateChange(created.id, null),
        ...operatorReassign(created.id, customer.operatorId),
      ])
      return
    }

    // 2. Open alert whose closing the actor confirmed, or
    // 3. a contact with an outcome and no alert: a new contact that keeps
    //    "Contattato il"
    const alertId =
      resolveAlert && customerTask.alertId ? customerTask.alertId : null
    if (
      alertId !== null ||
      (customerTask.state !== "chiamare" &&
        customerTask.state !== "followup" &&
        // Non distruggere chi ha un alert pendente (callback pianificato): per
        // questi clienti riassegniamo solo l'operatore, preservando task e alert.
        // La rimozione avviene solo su conferma esplicita.
        !customerTask.alertId)
    ) {
      if (alertId !== null) {
        yield* query((client) =>
          client
            .update(task)
            .set({ alertId: null })
            .where(eq(task.id, customerTask.id))
        )
      }
      const { created } = yield* replaceActiveContact({
        customer,
        values: {
          operatorId,
          state,
          priority: 120,
          closedAt: customerTask.closedAt,
        },
        // As at base, where the previous task was written first
        mostRecent: alertId !== null,
      })
      if (alertId !== null) {
        // Risolto in modo NON distruttivo: isResolved=true, record conservato,
        // il cron non lo riattiva
        yield* query((client) =>
          client
            .update(alert)
            .set({ isResolved: true, resolvedBy: actorOperatorId })
            .where(eq(alert.id, alertId))
        )
      }
      yield* setCustomerOperator
      yield* insertLogRows([
        ...(alertId !== null
          ? [
              {
                customerId,
                taskId: customerTask.id,
                alertId,
                actorOperatorId,
                action: "alert_resolved",
                source: "bulk",
              } as const,
            ]
          : []),
        ...stateChange(created.id, customerTask.state),
        ...operatorReassign(created.id, customerTask.operatorId),
      ])
      return
    }

    // 4. `chiamare` or `followup`, or an alert not confirmed: reassign only
    yield* query((client) =>
      client
        .update(task)
        .set({ operatorId })
        .where(eq(task.id, customerTask.id))
    )
    yield* setCustomerOperator
    yield* insertLogRows(
      operatorReassign(customerTask.id, customerTask.operatorId)
    )
  })

export const bulkHandleTask = operatorProcedure
  .input(bulkHandleTaskSchema)
  .mutation(({ ctx, input }) => {
    const resolveAlertSet = new Set(input.resolveAlertCustomerIds)
    // One transaction per customer, in the order given. The first failure
    // stops the run; the customers before it stay assigned.
    return runTrpc(
      Effect.forEach(
        input.customerIds,
        (customerId) =>
          transaction(
            assignCustomer({
              customerId,
              operatorId: input.operatorId,
              state: input.state,
              resolveAlert: resolveAlertSet.has(customerId),
              actorOperatorId: ctx.operator.id,
            })
          ),
        { concurrency: 1, discard: true }
      ),
      customerNotFound
    )
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
