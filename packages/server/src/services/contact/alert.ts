import { Clock, Effect } from "effect"
import { and, eq } from "drizzle-orm"
import { type alertResolution, alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { type Db, type DbError, query, Tx } from "../../effect/db"

/** Where a change made from Contatti comes from: the row or the detail. */
export type ContactSource = "list" | "detail"

/** Where a closing comes from: Contatti, an assignment in bulk or the cron. */
export type AlertCloseSource = ContactSource | "bulk" | "cron_alert"

/** How an alert was closed (`alert.resolution`). */
export type AlertResolution = (typeof alertResolution)[number]

/**
 * Closes the alert `alertId` of the contact task `taskId`: the only way the
 * services close one. Runs in a transaction, after the customer is locked.
 *
 * - Already closed: writes nothing, no `resolved_by`, date or log (F14).
 * - Detaches it from the task only if the task still points at it: never an
 *   alert linked since (R7, as the cron does).
 * - Sets `resolved_by` to the actor, `resolved_at` to the clock's instant and
 *   `resolution` to how it closed.
 * - Writes one `alert_resolved` row with `source`. With `source: null`, the
 *   conversion of the states (`convertStates.ts`), it writes none: the
 *   conversion writes nothing in the log (esiti-richiami-stati AC32), and the
 *   Storico shows the closing from the alert row (AC23).
 */
export const resolveOpenAlert = Effect.fn("contact.resolveOpenAlert")(
  function* (
    closing: {
      taskId: number
      alertId: number
      actorOperatorId: number
      resolution: AlertResolution
    } & (
      | { customerId: string; source: AlertCloseSource }
      | { customerId: string | null; source: null }
    )
  ): Effect.fn.Return<{ resolved: boolean }, DbError, Db | Tx> {
    const { taskId, alertId, actorOperatorId, resolution } = closing
    // Outside a transaction the three writes would commit apart
    yield* Tx
    const resolvedAt = new Date(yield* Clock.currentTimeMillis)
    const closed = yield* query((client) =>
      client
        .update(alert)
        .set({
          isResolved: true,
          resolvedBy: actorOperatorId,
          resolvedAt,
          resolution,
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
    if (closing.source === null) return { resolved: true }
    const { customerId, source } = closing
    yield* query((client) =>
      client.insert(taskEventLog).values({
        customerId,
        taskId,
        alertId,
        actorOperatorId,
        action: "alert_resolved",
        source,
      })
    )
    return { resolved: true }
  }
)
