import { Effect } from "effect"
import { and, count, eq, notInArray } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import type { Actor } from "@mito/domain/contact/permissions"
import { query } from "../../effect/db"

/**
 * How many tasks are done (`done`: neither "chiamare" nor "nessuno") and how
 * many are still to call (`todo`: "chiamare"). An operator counts only their
 * own tasks; an admin counts all of them.
 */
export const contactProgress = ({ actor }: { actor: Actor }) =>
  Effect.gen(function* () {
    const accessCondition =
      actor.role === "ADMIN" ? undefined : eq(task.operatorId, actor.operatorId)

    const done = yield* query((client) =>
      client
        .select({
          done: count(),
        })
        .from(task)
        .where(
          and(notInArray(task.state, ["chiamare", "nessuno"]), accessCondition)
        )
    )

    const todo = yield* query((client) =>
      client
        .select({
          todo: count(),
        })
        .from(task)
        .where(and(eq(task.state, "chiamare"), accessCondition))
    )

    return {
      done: done[0]?.done ?? 0,
      todo: todo[0]?.todo ?? 0,
    }
  })
