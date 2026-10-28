import { Cause, Effect, Exit, Option, Result } from "effect"
import { type ServerServices, serverLayer } from "@mito/server/effect/server"

/**
 * Provides `serverLayer` to a server program, inside `it.effect` or `it.live`:
 * `yield* program.pipe(provideServer, Effect.exit)`.
 */
export const provideServer = Effect.provide(serverLayer)

/**
 * Runs a server program with `serverLayer` and returns a Promise, as the edges
 * do. Tests use `it.effect` and `provideServer`; this stays for a cell of an
 * `each` table that must return a Promise (`deactivate.pg.test.ts`).
 */
export const runServer = <A, E>(program: Effect.Effect<A, E, ServerServices>) =>
  Effect.runPromiseExit(program.pipe(Effect.provide(serverLayer)))

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
