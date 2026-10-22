import "server-only"
import { Effect } from "effect"
import { eq, inArray } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query } from "../../effect/db"

type RoleChange = { id: number; role: "ADMIN" | "OPERATORE" }

/**
 * Sets the role of each listed operator's user and returns `changes` as it
 * is. One update per operator, in order, outside a transaction; an id with no
 * operator is skipped without an error. The transaction and the last-admin
 * guard come later (gestione-operatori, PR 4).
 */
export const updateOperatorsRole = (
  changes: readonly RoleChange[]
): Effect.Effect<readonly RoleChange[], DbError, Db> =>
  Effect.gen(function* () {
    const found = yield* query((client) =>
      client
        .select({ id: operators.id, userId: operators.userId })
        .from(operators)
        .where(
          inArray(
            operators.id,
            changes.map((change) => change.id)
          )
        )
    )

    for (const operator of found) {
      const role = changes.find((change) => change.id === operator.id)!.role
      yield* query((client) =>
        client.update(users).set({ role }).where(eq(users.id, operator.userId))
      )
    }

    return changes
  })
