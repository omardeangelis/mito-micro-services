import { Effect, Exit } from "effect"
import { type Db } from "../effect/db"
import { ServerLive } from "../effect/server"
import { onAuthDb } from "./database"

/**
 * Runs a login rule for a hook of better-auth: true when it lets the user in,
 * false when it refuses. A database failure is logged and thrown without its
 * message, which better-auth would put in the error URL.
 */
export async function admits<E extends { readonly _tag: string }>(
  program: Effect.Effect<void, E, Db>
): Promise<boolean> {
  const exit = await Effect.runPromiseExit(
    onAuthDb(program).pipe(
      Effect.map(() => true),
      Effect.catchIf(
        (error) => error._tag !== "DbError",
        () => Effect.succeed(false)
      ),
      Effect.tapCause((cause) =>
        Effect.logError("Sign-in database step failed", cause)
      ),
      Effect.provide(ServerLive)
    )
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error("Sign-in failed")
}
