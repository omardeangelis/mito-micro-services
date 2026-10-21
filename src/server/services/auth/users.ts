import "server-only"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { type AdapterUser } from "next-auth/adapters"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { query, transaction } from "@/server/effect/db"

/**
 * Creates the user NextAuth signs up, without the provider's picture, and its
 * operator, which every operator procedure requires. Both rows or neither.
 * Only the provider's fields: the role and the preferences keep their defaults.
 */
export const createUserWithOperator = (user: Omit<AdapterUser, "id">) =>
  transaction(
    Effect.gen(function* () {
      const [created] = yield* query((client) =>
        client
          .insert(users)
          .values({
            id: crypto.randomUUID(),
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: null,
          })
          .returning()
      )
      if (!created) return yield* Effect.dieMessage("INSERT returned no user")
      yield* query((client) =>
        client.insert(operators).values({ userId: created.id })
      )
      return created
    })
  )

/**
 * How the users in the database match this email: with the same letters
 * ("exact"), only in another letter case ("other-case"), or not at all. The
 * NextAuth adapter looks a user up by the exact email, so with "other-case" it
 * would sign up a second user.
 */
export const matchUserEmail = (email: string) =>
  query((client) =>
    client
      .select({ email: users.email })
      .from(users)
      // Both sides through Postgres's lower, which can differ from JavaScript's
      .where(sql`lower(${users.email}) = lower(${email})`)
  ).pipe(
    Effect.map((rows) =>
      rows.some((row) => row.email === email)
        ? ("exact" as const)
        : rows.length > 0
          ? ("other-case" as const)
          : ("none" as const)
    )
  )
