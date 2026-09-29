import "server-only"
import * as Sentry from "@sentry/nextjs"
import { Cause, Context, Effect, Exit, Layer } from "effect"

/**
 * Reports a failure no edge would see. tRPC procedures don't use it: their
 * failures reach Sentry from the tRPC middleware (`src/server/api/trpc.ts`).
 */
export class ErrorReporter extends Context.Tag("ErrorReporter")<
  ErrorReporter,
  {
    /** `data` holds the ids that tell the case apart (alert, customer, …). */
    readonly report: (
      cause: Cause.Cause<unknown>,
      data: Record<string, unknown>
    ) => Effect.Effect<void>
  }
>() {}

export const SentryReporterLive = Layer.succeed(ErrorReporter, {
  report: (cause, data) =>
    Effect.sync(() => {
      Sentry.captureException(Cause.squash(cause), {
        contexts: { details: data },
      })
    }),
})

/**
 * Runs `f` on each item in order, with its index, and keeps going when one
 * fails: an error, a defect (a thrown exception) or an interruption. Each
 * failure is logged and reported with `describe(item)`.
 */
export const forEachIsolated = <A, B, E, R>(
  items: Iterable<A>,
  f: (item: A, index: number) => Effect.Effect<B, E, R>,
  describe: (item: A) => Record<string, unknown>
): Effect.Effect<
  { succeeded: B[]; failed: number },
  never,
  R | ErrorReporter
> =>
  Effect.gen(function* () {
    const reporter = yield* ErrorReporter
    const succeeded: B[] = []
    let failed = 0
    let index = 0
    for (const item of items) {
      // Effect.exit, not Effect.either: defects must not stop the loop
      const exit = yield* Effect.exit(f(item, index++))
      if (Exit.isSuccess(exit)) {
        succeeded.push(exit.value)
        continue
      }
      failed++
      const data = describe(item)
      yield* Effect.logError("Item failed", Cause.pretty(exit.cause)).pipe(
        Effect.annotateLogs(data)
      )
      yield* reporter.report(exit.cause, data)
    }
    return { succeeded, failed }
  })
