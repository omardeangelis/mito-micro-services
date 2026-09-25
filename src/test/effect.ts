import { Cause, Effect, Exit, type Layer, Option } from "effect"
import { ServerLive } from "@/server/effect/server"

/** Runs a server program with `ServerLive`, as the edges do. */
export const runServer = <A, E>(
  program: Effect.Effect<A, E, Layer.Layer.Success<typeof ServerLive>>
) => Effect.runPromiseExit(program.pipe(Effect.provide(ServerLive)))

/** The `_tag` of the error in `cause`, if it holds one. */
export const causeTag = (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.failureOption(cause))
  return (error as { _tag?: string } | undefined)?._tag
}

/** The `_tag` of the error the program failed with, if it failed with one. */
export const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? causeTag(exit.cause) : undefined

/** Whether the program died with a defect (a thrown exception, `Effect.die`). */
export const isDefect = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) && Option.isSome(Cause.dieOption(exit.cause))
