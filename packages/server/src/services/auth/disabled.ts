import "server-only"
import { Effect } from "effect"
import { eq, or, sql } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query } from "../../effect/db"

/**
 * Whether the user signing in, or the one of a session, is deactivated
 * (gestione-operatori, AC16, AC17). The user with `id` decides when there is
 * one; otherwise the users with `email` in any letter case (Postgres's
 * `lower`, as `matchUserEmail`), deactivated if one of them is. With neither
 * field, or no user found, false.
 */
export const isUserDisabled = ({
  id,
  email,
}: {
  id?: string
  email?: string | null
}): Effect.Effect<boolean, DbError, Db> => {
  const conditions = [
    id ? eq(users.id, id) : undefined,
    email ? sql`lower(${users.email}) = lower(${email})` : undefined,
  ].filter((condition) => condition !== undefined)
  if (conditions.length === 0) return Effect.succeed(false)
  return query((client) =>
    client
      .select({ id: users.id, disabledAt: users.disabledAt })
      .from(users)
      .where(or(...conditions))
  ).pipe(
    Effect.map((rows) => {
      const byId = id ? rows.find((row) => row.id === id) : undefined
      if (byId) return byId.disabledAt !== null
      return rows.some((row) => row.disabledAt !== null)
    })
  )
}
