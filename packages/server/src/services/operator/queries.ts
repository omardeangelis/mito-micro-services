import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { operatorSelectCompleteResponse } from "@mito/domain/constants/schema"
import { query } from "../../effect/db"

/**
 * The operators that can work: those with a user row, with their role. The
 * system operator has no user, so it is not listed. "Active" is "with a user
 * row" for now; the deactivation spec will add its filter here.
 */
export const listActiveOperators = () =>
  query((client) =>
    client
      .selectDistinct({
        ...operatorSelectCompleteResponse,
        role: users.role,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
  )

/**
 * The operator with `id` and its role, or `undefined`. Quirk kept on purpose:
 * without an `id` (or with 0) the query has no WHERE and returns the first row.
 */
export const getOperatorById = (id: number | undefined) =>
  query((client) =>
    client
      .select({
        ...operatorSelectCompleteResponse,
        role: users.role,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(id ? eq(operators.id, id) : undefined)
  ).pipe(Effect.map((rows) => rows[0]))

/** `id`, `name` and `surname` of the operator of `userId`, or `undefined`. */
export const getPublicOperator = (userId: string) =>
  query((client) =>
    client
      .select({
        id: operators.id,
        name: operators.name,
        surname: operators.surname,
      })
      .from(operators)
      .where(eq(operators.userId, userId))
  ).pipe(Effect.map((rows) => rows[0]))
