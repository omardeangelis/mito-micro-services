import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { bandValue, type PriorityBand } from "@mito/domain/contact/priority"
import { task } from "@mito/db/schema/task"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  query,
  transaction,
} from "../../effect/db"
import {
  type ContactForbidden,
  type ContactNotFound,
  type ContactSuperseded,
} from "./errors"
import { loadEditableContact } from "./guard"

/**
 * The priority of a contact set by hand (AC42) or given back to the cron
 * (AC43), if the actor may edit it (AC27, AC49, D2). A band stores its value
 * and stops the cron from overwriting it; "auto" only clears `customPriority`
 * and leaves the value for the cron to recompute (D3). Nothing is logged and
 * the customer's `updatedAt` doesn't change.
 */
export const setPriority = ({
  taskId,
  priority,
  actor,
}: {
  taskId: number
  priority: PriorityBand | "auto"
  actor: Actor
}): Effect.Effect<
  void,
  | ContactNotFound
  | ContactSuperseded
  | ContactForbidden
  | CustomerMissing
  | DbError,
  Db
> =>
  transaction(
    Effect.gen(function* () {
      yield* loadEditableContact(taskId, actor)
      yield* query((client) =>
        client
          .update(task)
          .set(
            priority === "auto"
              ? { customPriority: false }
              : { priority: bandValue(priority), customPriority: true }
          )
          .where(eq(task.id, taskId))
      )
    })
  )
