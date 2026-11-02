import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import {
  type ContactState,
  removeCallbackTargets,
} from "@mito/domain/contact/status"
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
import { resolveOpenAlert } from "./alert"
import {
  CallbackChanged,
  type ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
  TransitionRejected,
} from "./errors"
import { loadEditableContact, touchCustomer } from "./guard"

/**
 * «Togli il richiamo» (AC21, AC22): closes the open alert `alertId` of the
 * contact `taskId` with `resolution = 'removed'` and gives the contact the
 * state the user chose, even the one it already has. All or nothing, with the
 * customer locked.
 *
 * - The checks: `loadEditableContact` (not found, superseded, forbidden),
 *   then `TransitionRejected` for a state outside `removeCallbackTargets`
 *   (Richiamo among them), then `CallbackChanged` when the alert is no longer
 *   open or no longer the one linked to the contact. A rejection writes
 *   nothing.
 * - The writes: the alert closed (`alert_resolved` row, source `detail`, A2),
 *   the state, and a `state_change` row (source `detail`) only when the state
 *   changes.
 * - It is the same contact, with its operator, priority and «Contattato il»
 *   (AC29): never a `call` row, never `closed_at`.
 */
export const removeCallback = Effect.fn("contact.removeCallback")(function* ({
  alertId,
  taskId,
  state,
  actor,
}: {
  alertId: number
  taskId: number
  state: TaskStatus
  actor: Actor
}): Effect.fn.Return<
  { taskId: number; state: TaskStatus },
  | TransitionRejected
  | CallbackChanged
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | DbError,
  Db
> {
  return yield* transaction(
    Effect.gen(function* () {
      const contact = yield* loadEditableContact(taskId, actor)
      const { customer, openAlert } = contact
      const from = contact.task.state

      if (!(removeCallbackTargets as readonly TaskStatus[]).includes(state)) {
        return yield* new TransitionRejected({ from, to: state })
      }
      if (!openAlert || openAlert.id !== alertId) {
        return yield* new CallbackChanged()
      }

      yield* resolveOpenAlert({
        customerId: customer.id,
        taskId,
        alertId,
        actorOperatorId: actor.operatorId,
        source: "detail",
        resolution: "removed",
      })
      // The chosen state is one of `removeCallbackTargets`
      const chosen: ContactState = state as ContactState
      yield* query((client) =>
        client.update(task).set({ state: chosen }).where(eq(task.id, taskId))
      )
      if (from !== chosen) {
        yield* query((client) =>
          client.insert(taskEventLog).values({
            customerId: customer.id,
            taskId,
            actorOperatorId: actor.operatorId,
            action: "state_change",
            source: "detail",
            fromState: from,
            toState: chosen,
          })
        )
      }
      yield* touchCustomer(customer)

      return { taskId, state: chosen }
    })
  )
})
