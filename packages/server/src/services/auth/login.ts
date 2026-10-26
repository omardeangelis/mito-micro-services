import "server-only"
import { Data, Effect } from "effect"
import { eq } from "drizzle-orm"
import { operators } from "@mito/db/schema/operators"
import { users } from "@mito/db/schema/users"
import { type Db, type DbError, query } from "../../effect/db"
import { isUserDisabled } from "./disabled"
import { matchUserEmail } from "./users"

/** The user signing in is deactivated (gestione-operatori, AC17). */
export class UserDisabled extends Data.TaggedError("UserDisabled") {}

/** In a test environment, an address without a user that isn't allowed. */
export class EmailNotAllowed extends Data.TaggedError("EmailNotAllowed") {}

/**
 * A user has this email in another letter case. better-auth looks users up by
 * the lowercase email, so it didn't find them and would sign up a second one.
 */
export class EmailOtherCase extends Data.TaggedError("EmailOtherCase") {}

/**
 * A user already has this email, and the account signing in isn't linked to
 * them: never linked by the email alone (AC3).
 */
export class EmailTaken extends Data.TaggedError("EmailTaken") {}

export type LoginRefused =
  UserDisabled | EmailNotAllowed | EmailOtherCase | EmailTaken

/** Who may sign up: anyone the provider lets in, or in a test environment only `allowedEmails` (lowercase). */
export type SignUpRules = {
  readonly testLogin: boolean
  readonly allowedEmails: ReadonlySet<string>
}

/**
 * Whether a new user with `email` may be created (AC9, AC10, AC11): never when
 * a user has the email in any letter case, and in a test environment only for
 * the allowed addresses.
 */
export const admitNewUser = (
  email: string | null | undefined,
  rules: SignUpRules
): Effect.Effect<void, LoginRefused | DbError, Db> =>
  Effect.gen(function* () {
    if (!email) return yield* new EmailNotAllowed()
    const match = yield* matchUserEmail(email)
    if (match === "exact") return yield* new EmailTaken()
    if (match === "other-case") return yield* new EmailOtherCase()
    if (rules.testLogin && !rules.allowedEmails.has(email.toLowerCase())) {
      return yield* new EmailNotAllowed()
    }
  })

/**
 * Whether the email login may send a link to `email` (AC9, AC11, AC12): to the
 * user with this email in lowercase, unless deactivated; to an address without
 * a user only when a new user may have it.
 */
export const admitMagicLink = (
  email: string,
  rules: SignUpRules
): Effect.Effect<void, LoginRefused | DbError, Db> =>
  Effect.gen(function* () {
    if (yield* isUserDisabled({ email })) return yield* new UserDisabled()
    // In lowercase, as better-auth looks the user up and signs them up
    const lowercase = email.toLowerCase()
    if ((yield* matchUserEmail(lowercase)) === "exact") return
    yield* admitNewUser(lowercase, rules)
  })

/** Whether the user `userId` may have a new session: not when deactivated (AC11). */
export const admitSession = (
  userId: string
): Effect.Effect<void, UserDisabled | DbError, Db> =>
  isUserDisabled({ id: userId }).pipe(
    Effect.filterOrFail(
      (disabled) => !disabled,
      () => new UserDisabled()
    ),
    Effect.asVoid
  )

/**
 * Creates the operator of the user better-auth just signed up. better-auth
 * runs this after committing the user, so when it fails the user is deleted
 * (its account and sessions with it): both rows or neither (AC4).
 */
export const createOperatorOf = (
  userId: string
): Effect.Effect<void, DbError, Db> =>
  query((client) => client.insert(operators).values({ userId })).pipe(
    Effect.tapError(() =>
      query((client) => client.delete(users).where(eq(users.id, userId))).pipe(
        Effect.ignore
      )
    ),
    Effect.asVoid
  )
