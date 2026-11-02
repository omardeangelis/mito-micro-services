import { Effect } from "effect"
import { and, count, eq, inArray, isNull, or } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import type { Actor } from "@mito/domain/contact/permissions"
import {
  allStates,
  doneStates,
  queueStates,
  toContactState,
  type ContactState,
} from "@mito/domain/contact/status"
import { type TaskStatus } from "@mito/domain/schemas"
import { query } from "../../effect/db"

/**
 * The stored states that stand for one of `states`, legacy values included
 * (`toContactState`): `followup` and `nessuno` are Da chiamare, `erogata` is
 * Pratica caricata.
 */
const storedStatesOf = (states: readonly ContactState[]) =>
  allStates.filter((state) => states.includes(toContactState(state)))

/**
 * "Contatti con esito": the current queue, with no date filter. Only active
 * contacts count, split as AC6 does: `done` those already worked (Richiamo,
 * Appuntamento, Pratica caricata, Non interessato), `todo` those still to call
 * (Da chiamare and Non risponde). A contact with no state is Da chiamare. An
 * admin counts every active contact, an operator those assigned to them.
 */
export const contactProgress = Effect.fn("analytics.contactProgress")(
  function* ({ actor }: { actor: Actor }) {
    const accessCondition =
      actor.role === "ADMIN" ? undefined : eq(task.operatorId, actor.operatorId)

    const countIn = (states: readonly ContactState[]) =>
      query((client) =>
        client
          .select({ total: count() })
          .from(task)
          .where(
            and(
              eq(task.isActive, true),
              or(
                inArray(task.state, storedStatesOf(states)),
                states.includes("chiamare") ? isNull(task.state) : undefined
              ),
              accessCondition
            )
          )
      ).pipe(Effect.map((rows) => rows[0]?.total ?? 0))

    const [done, todo] = yield* Effect.all(
      [countIn(doneStates), countIn(queueStates)],
      { concurrency: "unbounded" }
    )
    return { done, todo }
  }
)
