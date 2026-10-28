import { Effect } from "effect"
import { and, desc, eq } from "drizzle-orm"
import { bandValue } from "@mito/domain/contact/priority"
import { type Task } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { lockCustomer, query, transaction } from "../../effect/db"
import { replaceActiveContact } from "./activeContact"
import { findWorkingOperator } from "./operator"

type LogRow = typeof taskEventLog.$inferInsert

/**
 * Assigns one customer, in its own transaction, following the four cases of
 * the operators' guide (brain/chore/crm/guida-assegnazione-massiva-e-alert.md).
 * The case is decided on the data read after the customer is locked.
 *
 * The target must be a working operator (`findWorkingOperator`): a missing,
 * disabled or system operator is `OperatorNotFound` and the customer is left
 * as it is. It is checked in each transaction, before the customer's lock (the
 * lock rule of `lockCustomer`), so a target disabled while the run goes on
 * stops it at the next customer.
 */
const assignCustomer = Effect.fnUntraced(function* ({
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
}) {
  // Users first, then customers: the target before the customer
  yield* findWorkingOperator(operatorId)
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
      values: {
        operatorId,
        state,
        priority: bandValue("urgent"),
        closedAt: null,
      },
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
        priority: bandValue("urgent"),
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
    client.update(task).set({ operatorId }).where(eq(task.id, customerTask.id))
  )
  yield* setCustomerOperator
  yield* insertLogRows(
    operatorReassign(customerTask.id, customerTask.operatorId)
  )
})

/**
 * "Assegnazione massiva": assigns `customerIds` to the working operator
 * `operatorId` with `state` (see `assignCustomer` for the four cases). The
 * alert of a customer is closed only when its id is in `resolveAlertCustomerIds`,
 * the ones the actor confirmed; for the others the alert is preserved.
 *
 * - `OperatorNotFound`: the target is missing, disabled or a system operator;
 * - `CustomerMissing`: a customer of the list doesn't exist.
 */
export const bulkHandleTask = ({
  operatorId,
  customerIds,
  state,
  resolveAlertCustomerIds,
  actorOperatorId,
}: {
  operatorId: number
  customerIds: string[]
  state: Task["state"]
  resolveAlertCustomerIds: string[]
  actorOperatorId: number
}) => {
  const resolveAlertSet = new Set(resolveAlertCustomerIds)
  // One transaction per customer, in the order given. The first failure
  // stops the run; the customers before it stay assigned.
  return Effect.forEach(
    customerIds,
    (customerId) =>
      transaction(
        assignCustomer({
          customerId,
          operatorId,
          state,
          resolveAlert: resolveAlertSet.has(customerId),
          actorOperatorId,
        })
      ),
    { concurrency: 1, discard: true }
  )
}
