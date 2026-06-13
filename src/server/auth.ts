import { DrizzleAdapter } from "@auth/drizzle-adapter"
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth"
import { type Adapter } from "next-auth/adapters"
import DiscordProvider from "next-auth/providers/discord"
import AzureADProvider from "next-auth/providers/azure-ad"
import Email from "next-auth/providers/email"
import { type Provider } from "next-auth/providers/index"
import { env } from "@/env"
import { db } from "@/server/db"
import { pgTableCreator } from "drizzle-orm/pg-core"

const providers: Provider[] = [
  AzureADProvider({
    clientId: `${env.AZURE_AD_CLIENT_ID}`,
    clientSecret: `${env.AZURE_AD_CLIENT_SECRET}`,
    tenantId: `${env.AZURE_AD_TENANT_ID}`,
    authorization: {
      params: { scope: "openid email profile User.Read  offline_access" },
    },
    httpOptions: { timeout: 10000 },
  }),
]

if (env.NODE_ENV !== "production" || env.CUSTOM_ACCESS) {
  providers.push(
    DiscordProvider({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
    })
  )
  providers.push(
    Email({
      from: "hpv4learning@gmail.com",
      server: `smtp://${env.SENDGRID_USERNAME}:${env.SENDGRID_API_KEY}@${env.SENDGRID_SERVER}:${env.SENDGRID_PORT}`,
    })
  )
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
    createUser: async (user) => {
      // Rimuove l'immagine prima della creazione dell'utente
      const userWithoutImage = { ...user, image: null }

      const createdUser = await DBAdapter.createUser!(userWithoutImage)

      await fetch(env.NEXT_PUBLIC_BASE_URL + "/api/operator/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createdUser),
      })

      return createdUser
    },
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
