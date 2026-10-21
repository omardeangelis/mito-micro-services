import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { Effect, Exit } from "effect"
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth"
import { type Adapter, type AdapterUser } from "next-auth/adapters"
import AzureADProvider from "next-auth/providers/azure-ad"
import Email from "next-auth/providers/email"
import { type Provider } from "next-auth/providers/index"
import { env, isProduction } from "@/env"
import { db } from "@mito/db"
import { type Db } from "@/server/effect/db"
import { ServerLive } from "@/server/effect/server"
import { requestSession } from "@/server/requestSession"
import {
  createUserWithOperator,
  matchUserEmail,
} from "@/server/services/auth/users"
import { pgTableCreator } from "drizzle-orm/pg-core"

// In production only Azure, and anyone the tenant lets in. Elsewhere the
// providers whose env vars are set, for the users already in the database and
// the addresses in AUTH_ALLOWED_EMAILS

const providers: Provider[] = []

if (
  env.AZURE_AD_CLIENT_ID &&
  env.AZURE_AD_CLIENT_SECRET &&
  env.AZURE_AD_TENANT_ID
) {
  providers.push(
    AzureADProvider({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      tenantId: env.AZURE_AD_TENANT_ID,
      authorization: {
        params: { scope: "openid email profile User.Read  offline_access" },
      },
      httpOptions: { timeout: 10000 },
    })
  )
}

if (!isProduction && env.NODE_ENV === "development") {
  // `next dev` prints the sign-in link instead of sending it
  providers.push(
    Email({
      sendVerificationRequest: ({ identifier, url }) => {
        console.log(`Sign-in link for ${identifier}: ${url}`)
      },
    })
  )
} else if (
  !isProduction &&
  env.SENDGRID_USERNAME &&
  env.SENDGRID_API_KEY &&
  env.SENDGRID_SERVER &&
  env.SENDGRID_PORT
) {
  providers.push(
    Email({
      from: "hpv4learning@gmail.com",
      server: `smtp://${env.SENDGRID_USERNAME}:${env.SENDGRID_API_KEY}@${env.SENDGRID_SERVER}:${env.SENDGRID_PORT}`,
    })
  )
}

const allowedEmails = new Set(
  (env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
)

/**
 * Runs a database program for NextAuth, which expects failures thrown. The
 * failure is logged here and thrown without its message, which NextAuth puts
 * in the URL of its error page.
 */
async function runAuth<A, E>(program: Effect.Effect<A, E, Db>): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(
      Effect.tapErrorCause((cause) =>
        Effect.logError("Sign-in database step failed", cause)
      ),
      Effect.provide(ServerLive)
    )
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error("Sign-in failed")
}

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"]
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */

const DBAdapter = DrizzleAdapter(db, createTable) as Adapter
export const authOptions: NextAuthOptions = {
  callbacks: {
    // Also called before the email login sends its link
    signIn: async ({ user }) => {
      if (isProduction) return true
      const email = user.email
      if (!email) return false
      // The adapter finds the user by the exact email. Saved in another letter
      // case, it would sign up a second one, an ADMIN by default
      const match = await runAuth(matchUserEmail(email))
      if (match === "exact") return true
      return match === "none" && allowedEmails.has(email.toLowerCase())
    },
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
    redirect: async ({ url, baseUrl }) => {
      if (url.includes("signin")) {
        return "/dashboard"
      }
      return baseUrl
    },
  },
  pages: {
    newUser: "/dashboard/profile?firstTime=true",
    signOut: "/login",
  },
  adapter: {
    ...DBAdapter,
    // Since 4.24.15 the Adapter type also allows @auth/core's createUser,
    // whose user has an id, so the parameter isn't inferred. NextAuth v4
    // still calls it without the id (core/lib/callback-handler)
    createUser: (user: Omit<AdapterUser, "id">) =>
      runAuth(createUserWithOperator(user)),
  },
  providers,
}

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 * In the backend (`api/`) the session is the one of the request it is serving
 * (`requestSession`), read from the same cookie and table.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => {
  const fromBackend = requestSession.getStore()
  if (fromBackend) return Promise.resolve(fromBackend.session)
  return getServerSession(authOptions)
}
