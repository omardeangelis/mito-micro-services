import { Effect } from "effect"
import { and, asc, eq, isNull, ne } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { operatorSelectCompleteResponse } from "@mito/domain/constants/schema"
import { query } from "../../effect/db"

/**
 * The operators that can work, with their role: those with a user row that
 * is not deactivated (gestione-operatori, AC14). The system operator has no
 * user, so it is not listed. The filters, the assignment pickers and the
 * admin table read this list; `getOperatorById` still finds a deactivated
 * operator, for the history.
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
      .where(isNull(users.disabledAt))
  )

/**
 * The operators a portfolio can be handed to when `operatorId` is deactivated:
 * the active ones (as `listActiveOperators`), but not `operatorId` itself, by
 * surname then name (gestione-operatori, AC21). Only what the select lists.
 */
export const listDeactivationTargets = (operatorId: number) =>
  query((client) =>
    client
      .select({
        id: operators.id,
        name: operators.name,
        surname: operators.surname,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(and(isNull(users.disabledAt), ne(operators.id, operatorId)))
      .orderBy(asc(operators.surname), asc(operators.name), asc(operators.id))
  )

/** The operator with `id` and its role, or `undefined`. */
export const getOperatorById = (id: number) =>
  query((client) =>
    client
      .select({
        ...operatorSelectCompleteResponse,
        role: users.role,
      })
      .from(operators)
      .innerJoin(users, eq(operators.userId, users.id))
      .where(eq(operators.id, id))
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
