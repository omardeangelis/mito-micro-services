import { Schema } from "effect"

/**
 * The public variables of the app, read once at startup (F11). Vite puts in
 * the bundle only the VITE_* ones: a missing or wrong value stops the app
 * here, not where it is read
 */
const Env = Schema.Struct({
  // "staging" only on the staging project, as APP_ENV of the Next.js app
  VITE_APP_ENV: Schema.optional(Schema.Literal("staging")),
})

export type Env = typeof Env.Type

export const parseEnv = (input: Record<string, unknown>): Env =>
  Schema.decodeUnknownSync(Env)(input, { onExcessProperty: "ignore" })

export const env = parseEnv(import.meta.env)
