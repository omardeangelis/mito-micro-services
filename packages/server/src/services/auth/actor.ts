import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { operatorSelectCompleteResponse } from "@mito/domain/constants/schema"
import { type Actor } from "@mito/domain/contact/permissions"
import { type Db, type DbClient, type DbError, query } from "../../effect/db"
import { actorOf } from "../contact/actor"
import { NotAnOperator } from "../operator/errors"

const operatorOfUser = (client: DbClient, userId: string) =>
  client
    .select({
      ...operatorSelectCompleteResponse,
      role: users.role,
    })
    .from(operators)
    .innerJoin(users, eq(operators.userId, users.id))
    .where(eq(operators.userId, userId))

/** The operator of a signed-in user, with the role of their user. */
export type ResolvedOperator = Awaited<
  ReturnType<typeof operatorOfUser>
>[number]

/**
 * The operator of `userId`, with their role, and the `Actor` built from it.
 * A user without an operator row fails with `NotAnOperator`.
 */
export const resolveActor = (
  userId: string
): Effect.Effect<
  { operator: ResolvedOperator; actor: Actor },
  NotAnOperator | DbError,
  Db
> =>
  Effect.gen(function* () {
    const [operator] = yield* query((client) => operatorOfUser(client, userId))
    if (!operator) return yield* new NotAnOperator()
    return { operator, actor: actorOf(operator) }
  })
