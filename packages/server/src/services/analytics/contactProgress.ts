import { Effect } from "effect"
import { and, count, eq, inArray } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import type { Actor } from "@mito/domain/contact/permissions"
import { callStates, outcomeStates } from "@mito/domain/contact/status"
import { query } from "../../effect/db"

/**
 * "Contatti con esito" sulla coda attuale (AC17), senza filtro di data.
 * Conta solo i contatti attivi: `done` quelli con un esito (`outcomeStates`),
 * `todo` quelli in coda (`callStates`). `nessuno`, lo stato vuoto e i contatti
 * non attivi non contano in nessuno dei due. Un ADMIN conta tutti i contatti
 * attivi, un OPERATORE solo quelli con il suo `operatorId`.
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
          and(
            eq(task.isActive, true),
            inArray(task.state, [...outcomeStates]),
            accessCondition
          )
        )
    )

    const todo = yield* query((client) =>
      client
        .select({
          todo: count(),
        })
        .from(task)
        .where(
          and(
            eq(task.isActive, true),
            inArray(task.state, [...callStates]),
            accessCondition
          )
        )
    )

    return {
      done: done[0]?.done ?? 0,
      todo: todo[0]?.todo ?? 0,
    }
  })
