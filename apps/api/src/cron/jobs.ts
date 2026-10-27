import { Cause, Clock, Data, Duration, Effect, Result } from "effect"
import { type Db } from "@mito/server/effect/db"
import { ErrorReporter } from "@mito/server/effect/errorReporter"
import { processDueAlerts } from "@mito/server/services/contact/processDueAlerts"
import { refreshPriorities } from "@mito/server/services/contact/refreshPriorities"
import { cleanupTaskEventLog } from "@mito/server/services/cron/cleanupTaskEventLog"
import { deleteExportFiles } from "@mito/server/services/cron/deleteExport"
import { updateCustomerAge } from "@mito/server/services/cron/updateCustomerAge"
import { updatePractices } from "@mito/server/services/cron/updatePractices"

/** A step of a job failed: plain async code threw, or a service's DbError. */
export class CronStepFailed extends Data.TaggedError("CronStepFailed")<{
  readonly step: string
  readonly cause: unknown
}> {}

/** The alerts that failed stay failed when tried again. */
export class AlertsFailed extends Data.TaggedError("AlertsFailed")<{
  readonly failed: number
}> {}

/** Some alerts are still open after the last call. */
export class AlertsLeft extends Data.TaggedError("AlertsLeft")<{
  readonly calls: number
}> {}

export type CronJob = {
  /**
   * Whether a failed run may run again on the same day (Cloud Scheduler's
   * "Force run"): only a job that does nothing twice. `update` adds a year to
   * the ages at every run: never.
   */
  readonly rerunnable: boolean
  readonly run: Effect.Effect<
    Record<string, number>,
    unknown,
    Db | ErrorReporter
  >
}

const step = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new CronStepFailed({ step: name, cause }),
  })

const now = Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)))

/** The UTC day of `date`, yyyy-MM-dd: the day of the runs. */
export const utcDay = (date: Date) => date.toISOString().slice(0, 10)

type AlertCall = {
  found: number
  processed: number
  skipped: number
  failed: number
  remaining: number
}

/**
 * The alert cron of `alert.js`, inside the backend: `processAlerts` takes the
 * open alerts until its budget runs out, and is called again while some are
 * left, up to `maxCalls` times.
 *
 * - A call that fails as a whole is reported and tried again after
 *   `retryDelay`.
 * - A call with failed alerts is tried again after `retryDelay`, so today's
 *   alerts get their followup today. When trying them again closes none, the
 *   job fails.
 */
export const alertJob = <E, R>(
  processAlerts: Effect.Effect<AlertCall, E, R>,
  {
    maxCalls = 20,
    retryDelay = Duration.seconds(10),
  }: { maxCalls?: number; retryDelay?: Duration.Input } = {}
) =>
  Effect.gen(function* () {
    const reporter = yield* ErrorReporter
    let retryingFailed = false
    let found: number | undefined
    let processed = 0
    let skipped = 0
    for (let call = 1; call <= maxCalls; call++) {
      const result = yield* Effect.result(
        processAlerts.pipe(
          Effect.tapCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError("Alert call failed", Cause.pretty(cause))
              yield* reporter.report(cause, { cron: "alert", call })
            })
          )
        )
      )
      if (Result.isFailure(result)) {
        yield* Effect.sleep(retryDelay)
        continue
      }
      const body = result.success
      found ??= body.found
      processed += body.processed
      skipped += body.skipped
      const counters = {
        found,
        processed,
        skipped,
        failed: body.failed,
        calls: call,
      }
      if (body.remaining > 0) {
        // The next call takes the ones left, failed ones included: it is not
        // a retry of failed alerts
        retryingFailed = false
        continue
      }
      // Every call takes all the open alerts again: one that gets through
      // them with none failed leaves none behind
      if (body.failed === 0) return counters
      if (retryingFailed && body.processed === 0) {
        return yield* new AlertsFailed({ failed: body.failed })
      }
      retryingFailed = true
      yield* Effect.sleep(retryDelay)
    }
    return yield* new AlertsLeft({ calls: maxCalls })
  })

// Each call stops taking new alerts after 40 s, as on Vercel
const ALERT_BUDGET_MS = 40_000

/**
 * The jobs Cloud Scheduler starts, by the name in the path
 * (/internal/cron/<name>). The UTC times are the ones of the GitHub crons:
 * priority 23:17, alert 23:47 (after priority), update 00:17, delete-export
 * 00:47.
 */
export const cronJobs: Record<string, CronJob> = {
  priority: {
    rerunnable: true,
    run: refreshPriorities().pipe(Effect.as({})),
  },
  alert: {
    rerunnable: true,
    run: alertJob(
      Effect.flatMap(now, (date) =>
        processDueAlerts(date, { budgetMs: ALERT_BUDGET_MS })
      )
    ),
  },
  update: {
    rerunnable: false,
    run: Effect.gen(function* () {
      // UTC, as on Vercel: the day of the run
      const date = yield* now
      const practices = yield* updatePractices(utcDay(date)).pipe(
        Effect.mapError(
          (cause) => new CronStepFailed({ step: "updatePractices", cause })
        )
      )
      const customers = yield* updateCustomerAge(
        date.getUTCMonth() + 1,
        date.getUTCDate()
      ).pipe(
        Effect.mapError(
          (cause) => new CronStepFailed({ step: "updateCustomerAge", cause })
        )
      )
      return { practices, customers }
    }),
  },
  "delete-export": {
    rerunnable: true,
    run: step("deleteExportFiles", deleteExportFiles),
  },
  "cleanup-task-event-log": {
    rerunnable: true,
    run: Effect.gen(function* () {
      const date = yield* now
      const deleted = yield* cleanupTaskEventLog(date).pipe(
        Effect.mapError(
          (cause) => new CronStepFailed({ step: "cleanupTaskEventLog", cause })
        )
      )
      return { deleted }
    }),
  },
}
