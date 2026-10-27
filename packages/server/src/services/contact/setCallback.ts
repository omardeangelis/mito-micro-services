import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { canSetCallback } from "@mito/domain/contact/status"
import { isDueOrOverdue } from "@mito/domain/contact/time"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "../../effect/db"
import { resolveOpenAlert } from "./alert"
import {
  AlertConfirmationRequired,
  CallbackNotAllowed,
  type ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
  DeadlineInPast,
} from "./errors"
import { loadEditableContact, touchCustomer } from "./guard"

/**
 * "Imposta richiamo" (AC44-AC46), all or nothing: a new alert on the contact,
 * which goes to `richiamare`. The form is the confirmation (no AC36), so the
 * open alert is replaced only when it is `replacesAlertId`, the one the form
 * showed; an alert closed meanwhile leaves nothing to replace.
 *
 * - `CallbackNotAllowed`: the state is not an outcome nor `nessuno` (AC46);
 * - `DeadlineInPast`: the deadline is on today's Rome day or before (D22);
 * - `AlertConfirmationRequired`: the open alert is not `replacesAlertId`,
 *   with the current one (AC44).
 *
 * Writes, with source `detail`, an `alert_resolved` row for the replaced
 * alert and a `state_change` row only when the state changes (AC45).
 */
export const setCallback = ({
  taskId,
  deadline,
  message,
  replacesAlertId,
  actor,
}: {
  taskId: number
  deadline: Date
  message: string | null
  replacesAlertId: number | null
  actor: Actor
}): Effect.Effect<
  { alertId: number },
  | CallbackNotAllowed
  | DeadlineInPast
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

      if (!canSetCallback(from)) {
        return yield* new CallbackNotAllowed({ state: from })
      }
      if (isDueOrOverdue(deadline, new Date())) {
        return yield* new DeadlineInPast()
      }
      if (openAlert && openAlert.id !== replacesAlertId) {
        const { id, deadline, message } = openAlert
        return yield* new AlertConfirmationRequired({
          alert: { id, deadline, message },
        })
      }

      if (openAlert) {
        yield* resolveOpenAlert({
          contact,
          alertId: openAlert.id,
          actor,
          source: "detail",
        })
      }

      const [created] = yield* query((client) =>
        client
          .insert(alert)
          .values({ taskId, deadline, message })
          .returning({ id: alert.id })
      )
      // An insert with `returning` gives back its row
      const alertId = created!.id
      yield* query((client) =>
        client
          .update(task)
          .set({ alertId, state: "richiamare" })
          .where(eq(task.id, taskId))
      )

      if (from !== "richiamare") {
        yield* query((client) =>
          client.insert(taskEventLog).values({
            customerId: customer.id,
            taskId,
            actorOperatorId: actor.operatorId,
            action: "state_change",
            source: "detail",
            fromState: from,
            toState: "richiamare",
          })
        )
      }
      yield* touchCustomer(customer)

      return { alertId }
    })
  )
