import { Cause, Effect, Exit, Option, Result } from "effect"
import { type ServerContext, ServerLive } from "@mito/server/effect/server"

/**
 * Provides `ServerLive` to a server program, inside `it.effect` or `it.live`:
 * `yield* program.pipe(provideServer, Effect.exit)`.
 */
export const provideServer = Effect.provide(ServerLive)

// Goes away in T17 (effect-4 PLAN): tests use `it.effect` and `provideServer`
/** Runs a server program with `ServerLive`, as the edges do. */
export const runServer = <A, E>(program: Effect.Effect<A, E, ServerContext>) =>
  Effect.runPromiseExit(program.pipe(Effect.provide(ServerLive)))

/** The `_tag` of the error in `cause`, if it holds one. */
export const causeTag = (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause))
  return (error as { _tag?: string } | undefined)?._tag
}

/** The `_tag` of the error the program failed with, if it failed with one. */
export const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? causeTag(exit.cause) : undefined

/** Whether the program died with a defect (a thrown exception, `Effect.die`). */
export const isDefect = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && Result.isSuccess(Cause.findDefect(exit.cause))
