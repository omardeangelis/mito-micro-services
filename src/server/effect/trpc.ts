import "server-only"
import { TRPCError } from "@trpc/server"
import { Cause, Effect, Exit, Option } from "effect"
import { DbError } from "./db"
import { type ServerContext, ServerLive } from "./server"

/** The typed error in `cause` that `mapError` translates, if any. */
const expectedFailure = (cause: Cause.Cause<unknown>) =>
  Option.filter(
    Cause.failureOption(cause),
    (error) => !(error instanceof DbError)
  )

/**
 * The edge of a tRPC procedure written in Effect: runs `program` with
 * `ServerLive` and turns its outcome into what tRPC expects.
 *
 * - Typed errors other than `DbError` become the `TRPCError` `mapError`
 *   returns. It is required whenever `program` has such errors.
 * - A `DbError` or a defect is logged and becomes INTERNAL_SERVER_ERROR with
 *   the original message, as tRPC does for a thrown error. The tRPC Sentry
 *   middleware reports it: this function doesn't.
 */
export async function runTrpc<A, E>(
  program: Effect.Effect<A, E, ServerContext>,
  ...[mapError]: [Exclude<E, DbError>] extends [never]
    ? []
    : [mapError: (error: Exclude<E, DbError>) => TRPCError]
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(
      Effect.tapErrorCause((cause) =>
        Option.isSome(expectedFailure(cause))
          ? Effect.void
          : Effect.logError("tRPC procedure failed", Cause.pretty(cause))
      ),
      Effect.provide(ServerLive)
    )
  )
  if (Exit.isSuccess(exit)) return exit.value

  const failure = expectedFailure(exit.cause)
  if (mapError && Option.isSome(failure)) {
    throw mapError(failure.value as Exclude<E, DbError>)
  }
  const error = Cause.squash(exit.cause)
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  })
}
