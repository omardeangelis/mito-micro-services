import { Schema } from "effect"

/**
 * The public variables of the app, read once at startup (F11). Vite puts in
 * the bundle only the VITE_* ones: a missing or wrong value stops the app
 * here, not where it is read
 */
const Env = Schema.Struct({
  // "staging" only on the staging project, as APP_ENV of the Next.js app
  VITE_APP_ENV: Schema.optional(Schema.Literal("staging")),
  // VERCEL_ENV of the build, which vite.config.ts copies here
  VITE_VERCEL_ENV: Schema.optional(Schema.String),
  // "true" where the backend allows the test login with the email link, as
  // AUTH_TEST_LOGIN of the Next.js app (spec auth-better-auth, OQ6)
  VITE_AUTH_TEST_LOGIN: Schema.optional(Schema.Literal("true", "false")),
  // The DSN of the Sentry project, as NEXT_PUBLIC_SENTRY_DSN of the Next.js app
  VITE_SENTRY_DSN: Schema.optional(Schema.String),
})

export type Env = typeof Env.Type

export const parseEnv = (input: Record<string, unknown>): Env =>
  Schema.decodeUnknownSync(Env)(input, { onExcessProperty: "ignore" })

export const env = parseEnv(import.meta.env)
