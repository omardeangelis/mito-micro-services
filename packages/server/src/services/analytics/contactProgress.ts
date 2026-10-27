import { Effect } from "effect"
import { and, count, eq, inArray } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import type { Actor } from "@mito/domain/contact/permissions"
import { callStates, outcomeStates } from "@mito/domain/contact/status"
import { type TaskStatus } from "@mito/domain/schemas"
import { query } from "../../effect/db"

/**
 * "Contatti con esito": the current queue, with no date filter. Only active
 * contacts count: `done` those with an outcome (`outcomeStates`), `todo` those
 * still in the queue (`callStates`); `nessuno` and no state count in neither.
 * An admin counts every active contact, an operator those assigned to them.
 */
export const contactProgress = Effect.fn("analytics.contactProgress")(
  function* ({ actor }: { actor: Actor }) {
    const accessCondition =
      actor.role === "ADMIN" ? undefined : eq(task.operatorId, actor.operatorId)

    const countIn = (states: readonly TaskStatus[]) =>
      query((client) =>
        client
          .select({ total: count() })
          .from(task)
          .where(
            and(
              eq(task.isActive, true),
              inArray(task.state, [...states]),
              accessCondition
            )
          )
      ).pipe(Effect.map((rows) => rows[0]?.total ?? 0))

    const [done, todo] = yield* Effect.all(
      [countIn(outcomeStates), countIn(callStates)],
      { concurrency: "unbounded" }
    )
    return { done, todo }
  }
)
