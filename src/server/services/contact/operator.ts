import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query } from "@/server/effect/db"
import { OperatorNotFound } from "./errors"

/**
 * The operator of `operatorId` if someone can work as them: an operator with
 * a user row, as the operator middleware requires. The schema has no
 * "active" flag, and the system operator has no user: else `OperatorNotFound`.
 */
export const findWorkingOperator = (
  operatorId: number
): Effect.Effect<{ id: number }, OperatorNotFound | DbError, Db> =>
  Effect.gen(function* () {
    const [operator] = yield* query((client) =>
      client
        .select({ id: operators.id })
        .from(operators)
        .innerJoin(users, eq(operators.userId, users.id))
        .where(eq(operators.id, operatorId))
    )
    if (!operator) return yield* new OperatorNotFound()
    return operator
  })
