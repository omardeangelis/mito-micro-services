import { Effect, Result } from "effect"
import { and, eq, isNull } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query, Tx } from "../../effect/db"
import { OperatorNotFound } from "./errors"

/**
 * The operator of `operatorId` if someone can work as them: an operator with
 * a user row that is not disabled (`users.disabledAt` null), as the operator
 * middleware requires. The system operator has no user: else
 * `OperatorNotFound`.
 *
 * It locks the operator's user row until the transaction ends (`FOR KEY SHARE
 * OF users`), which conflicts with the `FOR UPDATE` of a deactivation: the
 * caller's writes commit before the deactivation, or the target is disabled
 * and found missing. In READ COMMITTED a row a deactivation held is checked
 * again after the wait, so the disabled filter sits in the WHERE. Every writer
 * that takes a destination calls it inside its transaction and before
 * `lockCustomer` (the lock rule of `lockCustomer`: users first, then
 * customers).
 */
export const findWorkingOperator = (
  operatorId: number
): Effect.Effect<{ id: number }, OperatorNotFound | DbError, Db | Tx> =>
  Effect.gen(function* () {
    // Outside a transaction the lock would end with the query
    yield* Tx
    const [operator] = yield* query((client) =>
      client
        .select({ id: operators.id })
        .from(operators)
        .innerJoin(users, eq(operators.userId, users.id))
        .where(and(eq(operators.id, operatorId), isNull(users.disabledAt)))
        .for("key share", { of: users })
    )
    if (!operator) return yield* new OperatorNotFound()
    return operator
  })

/**
 * `findWorkingOperator` with its `OperatorNotFound` left to the caller: the
 * lock is taken first, in the order of the lock rule, while the caller reports
 * the errors of its own checks before the target's, as it did before it locked
 * the operator. A `DbError` fails right away: the transaction is aborted.
 */
export const lockWorkingOperator = (
  operatorId: number
): Effect.Effect<
  Result.Result<{ id: number }, OperatorNotFound>,
  DbError,
  Db | Tx
> =>
  findWorkingOperator(operatorId).pipe(
    Effect.map(Result.succeed),
    Effect.catchTag("OperatorNotFound", (error) =>
      Effect.succeed(Result.fail(error))
    )
  )
