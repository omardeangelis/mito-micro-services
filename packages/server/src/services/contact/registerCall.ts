import { Clock, Effect } from "effect"
import { and, eq } from "drizzle-orm"
import {
  type CallOutcome,
  needsConfirmation,
  outcomeEffect,
} from "@mito/domain/contact/outcome"
import {
  type Actor,
  operatorDisplayName,
} from "@mito/domain/contact/permissions"
import { callableStates, toContactState } from "@mito/domain/contact/status"
import { romeDay, romeDayBounds } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
  type Tx,
} from "../../effect/db"
import { type ContactSource, resolveOpenAlert } from "./alert"
import {
  AlertConfirmationRequired,
  CallAlreadyWorked,
  CallNotAllowed,
  type ContactForbidden,
  ContactNotFound,
  type ContactSuperseded,
  DeadlineInPast,
  MessageTooLong,
  RequestIdConflict,
} from "./errors"
import { loadEditableContact, loadOperator, touchCustomer } from "./guard"

/** The longest message of a Richiamare (AC13 case 9). */
const MAX_MESSAGE = 500

/** The day and message of a Richiamare: the day as `YYYY-MM-DD` in Rome. */
export type CallbackInput = { day: string; message?: string | null }

/**
 * One press of an outcome of «Registra chiamata». `workingAlertId` is the
 * open alert the user sees (AC13), `confirmedAlertId` the future one they
 * confirmed to close (AC14). Only Richiamare carries a callback.
 */
export type CallInput = {
  taskId: number
  actor: Actor
  requestId: string
  source: ContactSource
  workingAlertId?: number | undefined
  confirmedAlertId?: number | undefined
} & (
  | { outcome: "richiamare"; callback: CallbackInput }
  | { outcome: Exclude<CallOutcome, "richiamare"> }
)

/**
 * What a registered call leaves on the contact (AC16): its state, its open
 * alert and the call itself.
 */
export type RegisteredCall = {
  taskId: number
  state: TaskStatus
  alert: {
    id: number
    deadline: Date
    day: string
    message: string | null
  } | null
  call: {
    id: number
    outcome: CallOutcome
    origin: "alert" | "list"
    at: Date
    by: string
  }
}

/**
 * «Registra chiamata» (AC8-AC14, AC29), in one transaction with the customer
 * locked.
 *
 * 1. The same request again (D5): a `call` row with `requestId` of the same
 *    user and contact gives back its response, with no check and no write;
 *    of another user or contact it is `RequestIdConflict`.
 * 2. The checks of AC13, in its order: `ContactNotFound`,
 *    `ContactSuperseded`, `ContactForbidden` (cases 2-4, `loadEditableContact`),
 *    `CallAlreadyWorked` (5), `CallNotAllowed` (6),
 *    `AlertConfirmationRequired` (7), `DeadlineInPast` (8), `MessageTooLong`
 *    (9). A rejection writes nothing.
 * 3. The writes: the state and the alert as `outcomeEffect` says, a closed
 *    alert with `resolution = 'call'`, the new alert of a Richiamare, the
 *    `call` row and «Contattato il» (`closed_at`), all at the Clock's instant.
 *
 * The `call` row keeps in `alert_id` the contact's open alert after the call:
 * the new one of a Richiamare, the kept one of a Non risponde. The response
 * is rebuilt from the row, so a repeat gets the same one.
 */
export const registerCall = Effect.fn("contact.registerCall")(function* (
  input: CallInput
): Effect.fn.Return<
  RegisteredCall,
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CallAlreadyWorked
  | CallNotAllowed
  | AlertConfirmationRequired
  | DeadlineInPast
  | MessageTooLong
  | RequestIdConflict
  | CustomerMissing
  | DbError,
  Db
> {
  const { taskId, actor, requestId, source } = input
  return yield* transaction(
    Effect.gen(function* () {
      const [unlocked] = yield* query((client) =>
        client
          .select({ customerId: task.customerId })
          .from(task)
          .where(eq(task.id, taskId))
      )
      if (!unlocked) return yield* new ContactNotFound()
      // The lock first: a repeat arrived meanwhile waits here, then finds
      // the row of the first arrival
      yield* lockCustomer(unlocked.customerId)

      const [repeated] = yield* query((client) =>
        client
          .select()
          .from(taskEventLog)
          .where(eq(taskEventLog.requestId, requestId))
      )
      if (repeated) {
        if (
          repeated.action !== "call" ||
          repeated.taskId !== taskId ||
          repeated.actorOperatorId !== actor.operatorId
        ) {
          return yield* new RequestIdConflict()
        }
        return yield* responseOf(repeated)
      }

      const contact = yield* loadEditableContact(taskId, actor)
      const { customer, openAlert } = contact
      const from = contact.task.state
      const now = new Date(yield* Clock.currentTimeMillis)
      const today = romeDay(now)
      const open = openAlert && { ...openAlert, day: romeDay(openAlert.deadline) }

      if (input.workingAlertId !== undefined) {
        yield* rejectWorkedAlert(taskId, input.workingAlertId)
      }
      if (
        !(callableStates as readonly TaskStatus[]).includes(
          toContactState(from)
        )
      ) {
        return yield* new CallNotAllowed({ state: from })
      }
      if (
        input.outcome !== "non risponde" &&
        open &&
        needsConfirmation(open, today) &&
        open.id !== input.confirmedAlertId
      ) {
        const { id, deadline, message } = open
        return yield* new AlertConfirmationRequired({
          alert: { id, deadline, message },
        })
      }
      let callback: { deadline: Date; message: string | null } | null = null
      if (input.outcome === "richiamare") {
        const { day } = input.callback
        if (day <= today) return yield* new DeadlineInPast()
        const message = input.callback.message?.trim() ?? ""
        if (message.length > MAX_MESSAGE) return yield* new MessageTooLong()
        callback = {
          // Midnight in Rome of the day: noon UTC is always on that day
          deadline: romeDayBounds(new Date(`${day}T12:00:00.000Z`)).start,
          message: message === "" ? null : message,
        }
      }

      const effect = outcomeEffect(input.outcome, from, open, today)
      if (effect.alert !== "keep" && open) {
        yield* resolveOpenAlert({
          customerId: customer.id,
          taskId,
          alertId: open.id,
          actorOperatorId: actor.operatorId,
          source,
          resolution: "call",
          at: now,
        })
      }
      let alertId = effect.alert === "keep" ? (open?.id ?? null) : null
      if (callback) {
        const [created] = yield* query((client) =>
          client
            .insert(alert)
            .values({ taskId, ...callback })
            .returning({ id: alert.id })
        )
        // An insert with `returning` gives back its row
        alertId = created!.id
      }

      yield* query((client) =>
        client
          .update(task)
          .set({
            state: effect.state,
            closedAt: now,
            ...(effect.alert !== "keep" && { alertId }),
          })
          .where(eq(task.id, taskId))
      )
      const [row] = yield* query((client) =>
        client
          .insert(taskEventLog)
          .values({
            customerId: customer.id,
            taskId,
            alertId,
            actorOperatorId: actor.operatorId,
            action: "call",
            source,
            fromState: from,
            toState: effect.state,
            outcome: input.outcome,
            // AC10: from an alert when one was due today or before
            origin: open && open.day <= today ? "alert" : "list",
            requestId,
            createdAt: now,
          })
          .returning()
      )
      yield* touchCustomer(customer)

      return yield* responseOf(row!)
    })
  )
})

/**
 * AC13 case 5: the alert the user was working, on this contact, is closed by
 * a call. One closed another way lets the call go on (AC13).
 */
const rejectWorkedAlert = Effect.fnUntraced(function* (
  taskId: number,
  alertId: number
): Effect.fn.Return<void, CallAlreadyWorked | DbError, Db | Tx> {
  const [worked] = yield* query((client) =>
    client
      .select({
        isResolved: alert.isResolved,
        resolution: alert.resolution,
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt,
      })
      .from(alert)
      .where(and(eq(alert.id, alertId), eq(alert.taskId, taskId)))
  )
  if (
    !worked?.isResolved ||
    worked.resolution !== "call" ||
    worked.resolvedAt === null
  ) {
    return
  }
  return yield* new CallAlreadyWorked({
    by: yield* nameOf(worked.resolvedBy),
    at: worked.resolvedAt,
  })
})

/** The response of a `call` row, the same for every repeat of its request. */
const responseOf = Effect.fnUntraced(function* (
  row: typeof taskEventLog.$inferSelect
): Effect.fn.Return<RegisteredCall, DbError, Db | Tx> {
  const [open] =
    row.alertId === null
      ? []
      : yield* query((client) =>
          client
            .select({
              id: alert.id,
              deadline: alert.deadline,
              message: alert.message,
            })
            .from(alert)
            .where(eq(alert.id, row.alertId!))
        )
  return {
    // A `call` row always has its contact, state, outcome and origin
    taskId: row.taskId!,
    state: row.toState!,
    alert: open ? { ...open, day: romeDay(open.deadline) } : null,
    call: {
      id: row.id,
      outcome: row.outcome as CallOutcome,
      origin: row.origin!,
      at: row.createdAt,
      by: yield* nameOf(row.actorOperatorId),
    },
  }
})

/** The name of an operator as the interface shows it. */
const nameOf = Effect.fnUntraced(function* (operatorId: number | null) {
  const operator = yield* loadOperator(operatorId)
  return operator ? operatorDisplayName(operator) : `Operatore ${operatorId}`
})
