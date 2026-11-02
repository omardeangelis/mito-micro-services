import { Clock, Effect } from "effect"
import { eq } from "drizzle-orm"
import { needsConfirmation } from "@mito/domain/contact/outcome"
import { type Actor } from "@mito/domain/contact/permissions"
import { bandValue } from "@mito/domain/contact/priority"
import { selectorTargets } from "@mito/domain/contact/status"
import { romeDay } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "../../effect/db"
import { replaceActiveContact } from "./activeContact"
import { type ContactSource, resolveOpenAlert } from "./alert"
import {
  AlertConfirmationRequired,
  type ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
  TransitionRejected,
} from "./errors"
import { loadEditableContact, touchCustomer } from "./guard"

/**
 * The state change of the selector (AC17, AC38-AC41), all or nothing. Only
 * the changes that are not a call: `selectorTargets` of the current state
 * (Pratica caricata, and Da chiamare from Appuntamento, Pratica caricata and
 * Non interessato); the others are `TransitionRejected` (AC9, AC22: the
 * outcomes are `registerCall`, the removal is `removeCallback`).
 *
 * - The state the contact already has is a no-op (AC40).
 * - Pratica caricata closes the open alert, if any, with `resolution =
 *   'state_change'`; Da chiamare is a reopening (AC34): a new active contact.
 * - The open alert asks for a confirmation only when it is a future one
 *   (AC14, `AlertConfirmationRequired`); an alert due today or expired is
 *   closed without it.
 * - Never a call (no `call` row) and never «Contattato il» (`closed_at`)
 *   (AC29). Never changes an operator (AC41) nor, outside a reopening, the
 *   priority (D3).
 *
 * Returns the contact that now holds the state: the new one on a reopening.
 */
export const changeState = ({
  taskId,
  toState,
  source,
  confirmedAlertId,
  actor,
}: {
  taskId: number
  toState: TaskStatus
  source: ContactSource
  confirmedAlertId: number | null
  actor: Actor
}): Effect.Effect<
  { taskId: number; reopened: boolean },
  | TransitionRejected
  | AlertConfirmationRequired
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const contact = yield* loadEditableContact(taskId, actor)
      const { customer, openAlert } = contact
      const from = contact.task.state
      // The state the contact already has: nothing changes (AC40)
      if (toState === (from ?? "nessuno")) return { taskId, reopened: false }
      if (!(selectorTargets(from) as readonly TaskStatus[]).includes(toState)) {
        return yield* new TransitionRejected({ from, to: toState })
      }

      if (openAlert) {
        const now = new Date(yield* Clock.currentTimeMillis)
        const open = { ...openAlert, day: romeDay(openAlert.deadline) }
        if (
          needsConfirmation(open, romeDay(now)) &&
          open.id !== confirmedAlertId
        ) {
          const { id, deadline, message } = openAlert
          return yield* new AlertConfirmationRequired({
            alert: { id, deadline, message },
          })
        }
        yield* resolveOpenAlert({
          customerId: customer.id,
          taskId,
          alertId: openAlert.id,
          actorOperatorId: actor.operatorId,
          source,
          resolution: "state_change",
        })
      }

      const reopens = toState === "chiamare"
      let current = taskId
      if (reopens) {
        const { created } = yield* replaceActiveContact({
          customer,
          values: {
            state: "chiamare",
            operatorId: contact.task.operatorId,
            closedAt: contact.task.closedAt,
            priority: bandValue("urgent"),
            customPriority: false,
            alertId: null,
          },
          // The readers that pick the most recent task (F1) must see this one
          mostRecent: true,
        })
        current = created.id
      } else {
        yield* query((client) =>
          client.update(task).set({ state: toState }).where(eq(task.id, taskId))
        )
      }

      yield* query((client) =>
        client.insert(taskEventLog).values({
          customerId: customer.id,
          taskId: current,
          actorOperatorId: actor.operatorId,
          action: "state_change",
          source,
          fromState: from,
          toState,
        })
      )
      yield* touchCustomer(customer)

      return { taskId: current, reopened: reopens }
    })
  )
