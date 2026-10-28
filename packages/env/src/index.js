import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"
import { parseAllowedHosts } from "./allowedHosts.js"

/**
 * The production deployment, as the build saw it: next.config.js reads
 * VERCEL_ENV and APP_ENV and writes them into the bundles as
 * NEXT_PUBLIC_VERCEL_ENV and NEXT_PUBLIC_APP_ENV, "none" when unset, so the
 * config, the server and the browser decide alike. Staging is a production
 * deployment of its own Vercel project, with APP_ENV=staging. Locally neither
 * is set. Outside a Next.js bundle (next.config.js itself, the tests) the
 * NEXT_PUBLIC_ ones are unset, and VERCEL_ENV and APP_ENV decide.
 */
export const isProduction =
  (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV) ===
    "production" &&
  (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV) !== "staging"

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    SUPABASE_DB_CONNECTION_STRING: z
      .string()
      .refine(
        (str) => !str.includes("YOUR_MYSQL_URL_HERE"),
        "You forgot to change the default URL"
      ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      // Locally only. On Vercel NextAuth ignores it and takes the host of the
      // request (next-auth/utils/detect-origin), so it isn't required there
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url()
    ),
    // The only login in production; elsewhere one of the logins
    AZURE_AD_CLIENT_ID: isProduction ? z.string() : z.string().optional(),
    AZURE_AD_CLIENT_SECRET: isProduction ? z.string() : z.string().optional(),
    AZURE_AD_TENANT_ID: isProduction ? z.string() : z.string().optional(),
    NEXT_RUNTIME: z.enum(["nodejs", "edge"]).default("nodejs"),
    // Sentry reports and gets source maps only from production
    SENTRY_AUTH_TOKEN: isProduction ? z.string() : z.string().optional(),
    SUPABASE_MITO_PSW: z.string(),
    SUPABASE_KEY: z.string(),
    // The email login outside production; `next dev` prints the link instead
    SENDGRID_API_KEY: z.string().optional(),
    SENDGRID_USERNAME: z.string().optional(),
    SENDGRID_SERVER: z.string().optional(),
    SENDGRID_PORT: z.string().optional(),
    // Who signs in outside production besides the users already in the
    // database: comma-separated addresses
    AUTH_ALLOWED_EMAILS: z.string().optional(),
    // better-auth (brain/specs/crm/auth-better-auth), optional until it
    // serves the login: the secret of its cookies, and the frontend's address.
    // The secret is a Sensitive variable on Vercel, which the build sees as
    // "[SENSITIVE]": its length is checked when better-auth starts
    // (packages/server/src/betterAuth/index.ts)
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().url().optional(),
    // The other frontends of the same backend (spec auth-due-frontend):
    // exact hosts, comma separated, with the scheme of BETTER_AUTH_URL
    BETTER_AUTH_ALLOWED_HOSTS: z
      .string()
      .optional()
      .superRefine((value, ctx) => {
        try {
          parseAllowedHosts(value, process.env.BETTER_AUTH_URL)
        } catch (error) {
          ctx.addIssue({ code: "custom", message: String(error) })
        }
      }),
    // Exactly "true" turns on the test logins (the email link, the addresses
    // of AUTH_ALLOWED_EMAILS); anything else, or unset, leaves them off
    AUTH_TEST_LOGIN: z.string().optional(),
    CRON_SECRET_KEY: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
    // The backend on Cloud Run: with it set, the tRPC calls go there
    // (next.config.js checks it)
    BACKEND_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SENTRY_DSN: isProduction ? z.string() : z.string().optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string(),
    // VERCEL_ENV at build time (next.config.js): "production" on the
    // production deployments of both projects, "none" off Vercel
    NEXT_PUBLIC_VERCEL_ENV: z
      .enum(["production", "preview", "development", "none"])
      .optional(),
    // APP_ENV at build time (next.config.js): "staging" only on the staging
    // project, "none" elsewhere
    NEXT_PUBLIC_APP_ENV: z.enum(["staging", "none"]).optional(),
  },
  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    SUPABASE_DB_CONNECTION_STRING: process.env.SUPABASE_DB_CONNECTION_STRING,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_MITO_PSW: process.env.SUPABASE_MITO_PSW,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_USERNAME: process.env.SENDGRID_USERNAME,
    SENDGRID_SERVER: process.env.SENDGRID_SERVER,
    SENDGRID_PORT: process.env.SENDGRID_PORT,
    AUTH_ALLOWED_EMAILS: process.env.AUTH_ALLOWED_EMAILS,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_ALLOWED_HOSTS: process.env.BETTER_AUTH_ALLOWED_HOSTS,
    AUTH_TEST_LOGIN: process.env.AUTH_TEST_LOGIN,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    CRON_SECRET_KEY: process.env.CRON_SECRET_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    BACKEND_URL: process.env.BACKEND_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
})
