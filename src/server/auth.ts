import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { Cause, Effect, Exit } from "effect"
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth"
import { type Adapter } from "next-auth/adapters"
import AzureADProvider from "next-auth/providers/azure-ad"
import Email from "next-auth/providers/email"
import { type Provider } from "next-auth/providers/index"
import { env } from "@/env"
import { db } from "@/server/db"
import { type Db, DbLive } from "@/server/effect/db"
import {
  createUserWithOperator,
  isExistingUser,
} from "@/server/services/auth/users"
import { pgTableCreator } from "drizzle-orm/pg-core"

// In production only Azure, and anyone the tenant lets in. Elsewhere the
// providers whose env vars are set, for the users already in the database and
// the addresses in AUTH_ALLOWED_EMAILS
const isProduction = env.NEXT_PUBLIC_VERCEL_ENV === "production"

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

/** Runs a database program for NextAuth, which expects failures thrown. */
async function runAuth<A, E>(program: Effect.Effect<A, E, Db>): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(DbLive)))
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
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
      const email = user.email?.toLowerCase()
      if (!email) return false
      return allowedEmails.has(email) || runAuth(isExistingUser(email))
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
    createUser: (user) => runAuth(createUserWithOperator(user)),
  },
  providers,
  /**
   * ...add more providers here.
   *
   * Most other providers require a bit more work than the Discord provider. For example, the
   * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
   * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
   *
   * @see https://next-auth.js.org/providers/github
   */
}

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions)
