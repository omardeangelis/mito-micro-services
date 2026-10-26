import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { type Operator } from "@mito/domain/schemas"
import { type Db, type DbError, query } from "../../effect/db"
import { OperatorNotFound } from "../contact/errors"

/**
 * Writes the operator's name and surname and returns its row after the
 * update. An `operatorId` with no operator is `OperatorNotFound`.
 */
export const updateOperatorInfo = (
  operatorId: number,
  values: { name?: string | null; surname?: string | null }
): Effect.Effect<Operator, OperatorNotFound | DbError, Db> =>
  Effect.gen(function* () {
    const [row] = yield* query((client) =>
      client
        .update(operators)
        .set(values)
        .where(eq(operators.id, operatorId))
        .returning()
    )
    if (!row) return yield* new OperatorNotFound()
    return row
  })
