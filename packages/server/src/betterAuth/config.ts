import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { Effect, Exit } from "effect"
import {
  authAccounts,
  authSessions,
  authVerifications,
} from "@mito/db/schema/auth"
import { users } from "@mito/db/schema/users"
import { type Db } from "../effect/db"
import { ServerLive } from "../effect/server"
import { authDb, onAuthDb } from "./database"
import {
  admitNewUser,
  admitSession,
  createOperatorOf,
  type SignUpRules,
} from "../services/auth/login"

/** What `buildAuth` needs; `authFromEnv` reads it from `@mito/env`. */
export type AuthConfig = {
  /** The frontend's address: cookies, callbacks and trusted origin. */
  readonly baseURL: string
  readonly secret: string
  readonly azure?: {
    readonly clientId: string
    readonly clientSecret: string
    readonly tenantId: string
  }
} & SignUpRules

const DAY = 24 * 60 * 60

/**
 * Runs a login rule for a hook of better-auth: true when it lets the user in,
 * false when it refuses. A database failure is logged and thrown without its
 * message, which better-auth would put in the error URL.
 */
async function admits<E extends { readonly _tag: string }>(
  program: Effect.Effect<void, E, Db>
): Promise<boolean> {
  const exit = await Effect.runPromiseExit(
    onAuthDb(program).pipe(
      Effect.map(() => true),
      Effect.catchIf(
        (error) => error._tag !== "DbError",
        () => Effect.succeed(false)
      ),
      Effect.tapErrorCause((cause) =>
        Effect.logError("Sign-in database step failed", cause)
      ),
      Effect.provide(ServerLive)
    )
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error("Sign-in failed")
}

/** The provider's tokens are never kept (AC31). */
const withoutTokens = <T extends object>(account: T) => ({
  data: {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  },
})

/**
 * The better-auth instance: users in `mito-deutsche_user`, sessions, accounts
 * and verifications in the `auth_*` tables, the login rules of
 * `services/auth/login.ts` in its hooks.
 */
export function buildAuth(config: AuthConfig) {
  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(authDb, {
      provider: "pg",
      // User and account of a sign-up in one transaction
      transaction: true,
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    user: {
      // `emailVerified` is NextAuth's timestamp, still in use until PR E
      fields: { emailVerified: "emailConfirmed" },
      additionalFields: {
        role: {
          type: "string",
          input: false,
          required: false,
          defaultValue: "OPERATORE",
        },
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // Every read goes to the database: a deactivation counts at once (AC15)
      cookieCache: { enabled: false },
    },
    account: {
      // Never by the email alone (AC3)
      accountLinking: { enabled: false },
      updateAccountOnSignIn: false,
    },
    socialProviders: config.azure
      ? {
          microsoft: {
            clientId: config.azure.clientId,
            clientSecret: config.azure.clientSecret,
            tenantId: config.azure.tenantId,
            // No offline access, no Graph (AC31, AC4)
            disableDefaultScope: true,
            scope: ["openid", "profile", "email"],
            disableProfilePhoto: true,
            disableIdTokenSignIn: true,
            // The tenant vouches for the address; without this a later
            // magic link would drop the user's accounts
            mapProfileToUser: () => ({ image: undefined, emailVerified: true }),
          },
        }
      : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user) =>
            (await admits(admitNewUser(user.email, config)))
              ? { data: { ...user, image: null } }
              : false,
          after: async (user) => {
            const exit = await Effect.runPromiseExit(
              onAuthDb(createOperatorOf(user.id)).pipe(
                Effect.tapErrorCause((cause) =>
                  Effect.logError("Sign-up database step failed", cause)
                ),
                Effect.provide(ServerLive)
              )
            )
            if (Exit.isFailure(exit)) throw new Error("Sign-up failed")
          },
        },
      },
      session: {
        create: {
          before: async (session) =>
            (await admits(admitSession(session.userId))) ? undefined : false,
        },
      },
      account: {
        create: { before: async (account) => withoutTokens(account) },
        update: { before: async (account) => withoutTokens(account) },
      },
    },
  })
}

export type Auth = ReturnType<typeof buildAuth>
