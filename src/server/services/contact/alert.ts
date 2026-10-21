import "server-only"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query, Tx } from "@/server/effect/db"
import { type EditableContact } from "./guard"

/** Where a change made from Contatti comes from: the row or the detail. */
export type ContactSource = "list" | "detail"

/**
 * Closes the contact's alert `alertId`: the only way the contact services
 * close one. Runs in the transaction of the guard that returned `contact`.
 *
 * - Already closed: writes nothing, no `resolved_by`, date or log (F14).
 * - Detaches it from the task only if the task still points at it: never an
 *   alert linked since (R7, as the cron does).
 * - Writes one `alert_resolved` row with `source`.
 */
export const resolveOpenAlert = ({
  contact,
  alertId,
  actor,
  source,
}: {
  contact: EditableContact
  alertId: number
  actor: Actor
  source: ContactSource
}): Effect.Effect<{ resolved: boolean }, DbError, Db | Tx> =>
  Effect.gen(function* () {
    // Outside a transaction the three writes would commit apart
    yield* Tx
    const taskId = contact.task.id
    const closed = yield* query((client) =>
      client
        .update(alert)
        .set({
          isResolved: true,
          resolvedBy: actor.operatorId,
          // The Storico shows it as the closing date
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(alert.id, alertId),
            eq(alert.taskId, taskId),
            eq(alert.isResolved, false)
          )
        )
        .returning({ id: alert.id })
    )
    if (closed.length === 0) return { resolved: false }

    yield* query((client) =>
      client
        .update(task)
        .set({ alertId: null })
        .where(and(eq(task.id, taskId), eq(task.alertId, alertId)))
    )
    yield* query((client) =>
      client.insert(taskEventLog).values({
        customerId: contact.customer.id,
        taskId,
        alertId,
        actorOperatorId: actor.operatorId,
        action: "alert_resolved",
        source,
      })
    )
    return { resolved: true }
  })
