import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { planStateChange } from "@/lib/domain/contact/transition"
import { type Actor } from "@/lib/domain/contact/permissions"
import { bandValue } from "@/lib/domain/contact/priority"
import { type TaskStatus } from "@/lib/types/schemas"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "@/server/effect/db"
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
 * The state change of a contact (AC30-AC41), all or nothing (AC39). Closes
 * the open alert only when the actor confirmed that very alert (AC36, AC37).
 * A reopening (an outcome back to `chiamare`) gives the customer a new active
 * contact (AC34). Never changes an operator (AC41) nor, outside a reopening,
 * the priority (D3).
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
      const plan = planStateChange({
        from,
        to: toState,
        openAlertId: openAlert?.id ?? null,
        confirmedAlertId,
      })

      if (plan.kind === "reject") {
        return yield* new TransitionRejected({ from, to: toState })
      }
      if (plan.kind === "noop") return { taskId, reopened: false }
      if (plan.kind === "needsAlertConfirmation") {
        // The plan asks only when an alert is open
        const { id, deadline, message } = openAlert!
        return yield* new AlertConfirmationRequired({
          alert: { id, deadline, message },
        })
      }

      if (plan.resolveAlert) {
        yield* resolveOpenAlert({
          contact,
          alertId: openAlert!.id,
          actor,
          source,
        })
      }

      let current = taskId
      if (plan.kind === "reopen") {
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
          client
            .update(task)
            .set({
              state: toState,
              ...(plan.kind === "close" && { closedAt: new Date() }),
            })
            .where(eq(task.id, taskId))
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

      return { taskId: current, reopened: plan.kind === "reopen" }
    })
  )
