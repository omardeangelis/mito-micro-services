import "server-only"
import { asc, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { practices } from "@mito/db/schema/pratiche"
import { query, retryOnDeadlock, transaction } from "../../effect/db"

/**
 * Gives the operator `operatorId` the practices `practiceIds` ("Assegna" of
 * the Pratiche page); an id without a practice is skipped. One transaction
 * locks them in order of `pratica_id` and then updates them, as every writer
 * of several practices does (the lock rule of `lockCustomer`): with an import
 * on the same practices it waits instead of deadlocking (D6 of
 * import-pratiche). A deadlock with another writer runs it again.
 */
export const assignPractices = ({
  operatorId,
  practiceIds,
}: {
  operatorId: number
  practiceIds: readonly string[]
}) =>
  transaction(
    Effect.gen(function* () {
      const chosen = inArray(practices.praticaId, [...practiceIds])
      yield* query((client) =>
        client
          .select({ praticaId: practices.praticaId })
          .from(practices)
          .where(chosen)
          .orderBy(asc(practices.praticaId))
          .for("update")
      )
      yield* query((client) =>
        client.update(practices).set({ operatorId }).where(chosen)
      )
    })
  ).pipe(retryOnDeadlock)
