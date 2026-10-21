import "server-only"
import { Data, Effect } from "effect"
import { and, between, eq, isNotNull, ne } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { users } from "@mito/db/schema/users"
import { query } from "@/server/effect/db"

/** The session's user is no longer in the database. */
export class UserMissing extends Data.TaggedError("UserMissing")<{
  readonly userId: string
}> {}

/**
 * The calls closed in the interval, with their operator and customer, for the
 * calls export of the user `userId`. An admin gets everyone's calls; any other
 * user only the ones of their own operator, and none without one.
 */
export const closedCalls = (
  userId: string,
  interval: { from: Date; to: Date }
) =>
  Effect.gen(function* () {
    const [caller] = yield* query((client) =>
      client
        .select({ role: users.role, operatorId: operators.id })
        .from(users)
        .leftJoin(operators, eq(operators.userId, users.id))
        .where(eq(users.id, userId))
    )
    if (!caller) return yield* new UserMissing({ userId })

    const conditions = [
      ne(task.state, "nessuno"),
      isNotNull(task.closedAt),
      between(task.closedAt, interval.from, interval.to),
    ]
    if (caller.role !== "ADMIN") {
      if (caller.operatorId === null) return []
      conditions.push(eq(task.operatorId, caller.operatorId))
    }

    return yield* query((client) =>
      client
        .select()
        .from(task)
        .innerJoin(operators, eq(task.operatorId, operators.id))
        .innerJoin(customers, eq(task.customerId, customers.id))
        .where(and(...conditions))
        .orderBy(operators.surname, task.closedAt, task.id)
    )
  })

/** A row of the calls export: the call, its operator and its customer. */
export type ClosedCall = Effect.Effect.Success<
  ReturnType<typeof closedCalls>
>[number]
