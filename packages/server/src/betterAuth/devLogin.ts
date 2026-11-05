import type { BetterAuthPlugin } from "better-auth"
import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"

/** The accounts of the quick login, by what they sign in as. */
export type DevAccounts = {
  readonly admin: string
  readonly operator: string
  readonly typicalOperator?: string
}

/**
 * The users of the local seed (`src/server/db/seeds/local`): the first ADMIN,
 * the first OPERATORE, the one with the most contacts and the full day of the
 * home, and the OPERATORE with its typical day
 */
export const SEED_ACCOUNTS: DevAccounts = {
  admin: "seed-user-01",
  operator: "seed-user-04",
  typicalOperator: "seed-user-27",
}

/**
 * The quick login of local development: `POST /sign-in/dev-account` with
 * `{ account: "admin" | "operator" | "typicalOperator" }` opens a session for that user, with no
 * credentials. Only in development with the frontend on localhost
 * (`authConfigFrom`): the backend of staging is public, and this would let
 * anyone in as an admin
 */
export const devLogin = (accounts: DevAccounts) =>
  ({
    id: "dev-login",
    endpoints: {
      signInDevAccount: createAuthEndpoint(
        "/sign-in/dev-account",
        { method: "POST", requireHeaders: true, use: [formCsrfMiddleware] },
        async (ctx) => {
          const account = (ctx.body as { account?: unknown } | undefined)
            ?.account
          if (
            account !== "admin" &&
            account !== "operator" &&
            account !== "typicalOperator"
          ) {
            throw new APIError("BAD_REQUEST")
          }
          const userId = accounts[account]
          const user = userId
            ? await ctx.context.internalAdapter.findUserById(userId)
            : null
          if (!user) throw new APIError("NOT_FOUND")
          // A deactivated user gets none: the hook of `buildAuth` refuses it
          const session = await ctx.context.internalAdapter.createSession(
            user.id
          )
          if (!session) throw new APIError("FORBIDDEN")
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ ok: true })
        }
      ),
    },
  }) satisfies BetterAuthPlugin
