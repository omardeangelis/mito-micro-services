import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { operatorSelectCompleteResponse } from "@mito/domain/constants/schema"
import { type Actor } from "@mito/domain/contact/permissions"
import { type Db, type DbClient, type DbError, query } from "../../effect/db"
import { actorOf } from "../contact/actor"
import { NotAnOperator, OperatorDisabled } from "../operator/errors"

const operatorOfUser = (client: DbClient, userId: string) =>
  client
    .select({
      ...operatorSelectCompleteResponse,
      role: users.role,
      disabledAt: users.disabledAt,
    })
    .from(operators)
    .innerJoin(users, eq(operators.userId, users.id))
    .where(eq(operators.userId, userId))

/** The operator of a signed-in user, with the role of their user. */
export type ResolvedOperator = Omit<
  Awaited<ReturnType<typeof operatorOfUser>>[number],
  "disabledAt"
>

/**
 * The operator of `userId`, with their role, and the `Actor` built from it.
 * A user without an operator row fails with `NotAnOperator`, a deactivated
 * one with `OperatorDisabled`: the session read may be older than the
 * deactivation, or come from a test caller (AC16).
 */
export const resolveActor = Effect.fn("auth.resolveActor")(function* (
  userId: string
): Effect.fn.Return<
  { operator: ResolvedOperator; actor: Actor },
  NotAnOperator | OperatorDisabled | DbError,
  Db
> {
  const [row] = yield* query((client) => operatorOfUser(client, userId))
  if (!row) return yield* new NotAnOperator()
  const { disabledAt, ...operator } = row
  if (disabledAt !== null) return yield* new OperatorDisabled()
  return { operator, actor: actorOf(operator) }
})
