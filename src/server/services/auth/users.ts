import "server-only"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { type AdapterUser } from "next-auth/adapters"
import { operators } from "@/server/db/schema/operators"
import { users } from "@/server/db/schema/users"
import { query, transaction } from "@/server/effect/db"

/**
 * Creates the user NextAuth signs up, without the provider's picture, and its
 * operator, which every operator procedure requires. Both rows or neither.
 */
export const createUserWithOperator = (user: Omit<AdapterUser, "id">) =>
  transaction(
    Effect.gen(function* () {
      const [created] = yield* query((client) =>
        client
          .insert(users)
          .values({ ...user, id: crypto.randomUUID(), image: null })
          .returning()
      )
      if (!created) return yield* Effect.dieMessage("INSERT returned no user")
      yield* query((client) =>
        client.insert(operators).values({ userId: created.id })
      )
      return created
    })
  )

/** Whether a user with this email exists, in any letter case. */
export const isExistingUser = (email: string) =>
  query((client) =>
    client
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
      .limit(1)
  ).pipe(Effect.map((rows) => rows.length > 0))
