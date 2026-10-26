import "server-only"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { type UserPreference } from "@mito/domain/schemas"
import { operators } from "@mito/db/schema/operators"
import { type userRoles, users } from "@mito/db/schema/users"
import { type Db, type DbError, query } from "../../effect/db"
import { NotAnOperator } from "../operator/errors"

/**
 * The preferences, role and operator id of the user `userId`. A user without
 * an operator fails with `NotAnOperator`: every user is an operator.
 * Preferences stored as malformed JSON are a defect, as before.
 */
export const getCurrentUser = (
  userId: string
): Effect.Effect<
  {
    preferences: UserPreference
    role: (typeof userRoles.enumValues)[number]
    operatorId: number
  },
  NotAnOperator | DbError,
  Db
> =>
  Effect.gen(function* () {
    const rows = yield* query((client) =>
      client
        .select({
          preference: users.preferences,
          role: users.role,
          operatorId: operators.id,
        })
        .from(users)
        .innerJoin(operators, eq(users.id, operators.userId))
        .where(eq(users.id, userId))
    )
    const row = rows[0]
    if (!row) return yield* new NotAnOperator()
    const preferences = yield* Effect.sync(
      () => JSON.parse(row.preference ?? "{}") as UserPreference
    )
    return {
      preferences,
      role: row.role,
      operatorId: row.operatorId,
    }
  })
