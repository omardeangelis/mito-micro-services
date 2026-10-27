import { Cause, Clock, Effect, Exit, type Layer, Option, Schema } from "effect"
import { Hono } from "hono"
import { type Db } from "@mito/server/effect/db"
import { ErrorReporter } from "@mito/server/effect/errorReporter"
import { CronAuth } from "./auth"
import { type CronJob, cronJobs, utcDay } from "./jobs"
import { finishRun, startRun } from "./registry"
import { CronReport } from "./report"

class UnknownJob extends Schema.TaggedError<UnknownJob>()("UnknownJob", {}) {}

export type CronContext = CronAuth | CronReport | Db | ErrorReporter

/**
 * One call of a job: the scheduler's token, then at most one run per job and
 * UTC day (`startRun`), then the outcome in `cron_run`, in the report and,
 * for a failure, in Sentry.
 */
const runCron = Effect.fnUntraced(function* (
  name: string,
  jobs: Record<string, CronJob>,
  authorization: string | undefined
) {
  yield* (yield* CronAuth).verify(authorization)
  const job = Object.hasOwn(jobs, name) ? jobs[name] : undefined
  if (!job) return yield* new UnknownJob()

  const report = yield* CronReport
  const start = yield* Clock.currentTimeMillis
  const runId = yield* startRun(name, utcDay(new Date(start)), job.rerunnable)
  if (runId === undefined) {
    yield* report.send({
      job: name,
      status: "skipped",
      durationMs: 0,
      counters: {},
    })
    return {
      status: 200 as const,
      body: { job: name, skipped: "already ran today" },
    }
  }

  const exit = yield* Effect.exit(job.run)
  const durationMs = (yield* Clock.currentTimeMillis) - start
  if (Exit.isSuccess(exit)) {
    yield* finishRun(runId, "succeeded", exit.value)
    yield* report.send({
      job: name,
      status: "succeeded",
      durationMs,
      counters: exit.value,
    })
    return { status: 200 as const, body: { job: name, counters: exit.value } }
  }
  yield* Effect.logError(`Cron ${name} failed`, Cause.pretty(exit.cause))
  yield* (yield* ErrorReporter).report(exit.cause, { cron: name })
  yield* finishRun(runId, "failed", null)
  yield* report.send({
    job: name,
    status: "failed",
    durationMs,
    counters: {},
  })
  return { status: 500 as const, body: { job: name, error: "failed" } }
})

/**
 * The cron routes, POST /<job>, with the services they need. Cloud Scheduler
 * calls them with an OIDC token and no retry: a failed run waits for the next
 * day, or for a "Force run" when the job is rerunnable.
 */
export const cronRoutes = (
  layer: Layer.Layer<CronContext>,
  jobs: Record<string, CronJob> = cronJobs
) => {
  const routes = new Hono()
  routes.post("/:job", async (c) => {
    const name = c.req.param("job")
    const exit = await Effect.runPromiseExit(
      runCron(name, jobs, c.req.header("authorization")).pipe(
        Effect.provide(layer)
      )
    )
    if (Exit.isSuccess(exit)) return c.json(exit.value.body, exit.value.status)

    const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
    const tag = (error as { _tag?: string } | undefined)?._tag
    if (tag === "CronUnauthorized") {
      // Noise from scanners, not a failed job: logged, never reported
      const reason = (error as { reason: string }).reason
      console.warn(`Cron ${name} refused: ${reason}`)
      return c.json({ error: "Unauthorized" }, 401)
    }
    if (tag === "CronNotConfigured") {
      return c.json({ error: "Cron not configured" }, 503)
    }
    if (tag === "UnknownJob") return c.json({ error: "Unknown job" }, 404)
    // The registry failed (the database), before or after the job
    console.error(`Cron ${name} failed`, Cause.pretty(exit.cause))
    await Effect.runPromise(
      Effect.flatMap(ErrorReporter, (reporter) =>
        reporter.report(exit.cause, { cron: name })
      ).pipe(Effect.provide(layer))
    )
    return c.json({ job: name, error: "failed" }, 500)
  })
  return routes
}
