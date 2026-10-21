import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { alert } from "@mito/db/schema/task"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "@/server/effect/db"
import { type ContactSource, resolveOpenAlert } from "./alert"
import {
  AlertNotFound,
  type ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
} from "./errors"
import { loadEditableContact } from "./guard"

/**
 * The "X" on an alert (AC29): closes it if the actor may edit its contact
 * (AC27, AC49). An alert already closed is left as it is, without an error
 * (F14). The customer's `updatedAt` doesn't change.
 */
export const resolveAlert = ({
  alertId,
  actor,
  source,
}: {
  alertId: number
  actor: Actor
  source: ContactSource
}): Effect.Effect<
  { resolved: boolean },
  | AlertNotFound
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      const [target] = yield* query((client) =>
        client
          .select({ taskId: alert.taskId })
          .from(alert)
          .where(eq(alert.id, alertId))
      )
      if (!target) return yield* new AlertNotFound()

      const contact = yield* loadEditableContact(target.taskId, actor)
      return yield* resolveOpenAlert({ contact, alertId, actor, source })
    })
  )
