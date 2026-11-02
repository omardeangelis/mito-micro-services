import { Cause, Effect } from "effect"
import { type DbError } from "../effect/db"
import { ErrorReporter } from "../effect/errorReporter"
import { type CallsRegistryMissing } from "../services/export/callStats"

/**
 * What the contract doesn't declare is a 500: a database failure becomes a
 * defect, as the missing row of `calls_registry`, and every defect of
 * `endpoint` is logged and reported to Sentry, as the tRPC middleware does for
 * a procedure
 */
export const unexpectedAs500 =
  (endpoint: string) =>
  <A, E, R>(
    self: Effect.Effect<A, E | DbError | CallsRegistryMissing, R>
  ): Effect.Effect<
    A,
    Exclude<E, DbError | CallsRegistryMissing>,
    R | ErrorReporter
  > =>
    self.pipe(
      Effect.catchTag(["DbError", "CallsRegistryMissing"], (error) =>
        Effect.die(error)
      ),
      Effect.tapDefect((defect) =>
        Effect.gen(function* () {
          yield* Effect.logError(`HttpApi ${endpoint} failed`, defect)
          const reporter = yield* ErrorReporter
          yield* reporter.report(Cause.die(defect), { endpoint })
        })
      )
    ) as Effect.Effect<
      A,
      Exclude<E, DbError | CallsRegistryMissing>,
      R | ErrorReporter
    >
