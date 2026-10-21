// Runs the production cron jobs on the database of the seed: the same
// `cronJobs` Cloud Scheduler starts, with `Db` provided as the caller's client.
// The global db of `@mito/db` is never used: the jobs read the database only
// from the `Db` service.
import { Cause, Effect, Exit, Layer } from "effect"
import { Db, type DbClient } from "@mito/server/effect/db"
import { ErrorReporter } from "@mito/server/effect/errorReporter"
import { cronJobs } from "../../../../../apps/api/src/cron/jobs"
import { assertIsToday, assertSameRomeAndUtcDay } from "./day"
import type { CronName, Manifest, Run } from "./types"

/** The jobs the local seed runs, in the order they must run. */
export const CRON_ORDER: readonly CronName[] = [
  "priority",
  "alert",
  "update",
  "cleanup-task-event-log",
]

// Long enough to read the failure, short enough for the manifest
const MAX_ERROR_LENGTH = 2_000

const isCronName = (job: string): job is CronName =>
  (CRON_ORDER as readonly string[]).includes(job)

const NEW_SEED = "serve un nuovo seed (`pnpm seed:local`)"

/**
 * Checks the requested jobs against the runs already in the manifest (D6),
 * before anything runs. Throws an Italian message on the first violation.
 */
function assertRunnable(manifest: Manifest, jobs: readonly string[]): void {
  if (jobs.length === 0) {
    throw new Error("Nessun cron richiesto.")
  }
  for (const job of jobs) {
    if (!isCronName(job)) {
      throw new Error(
        `Il cron "${job}" non si esegue sul seed locale: sono ammessi solo ` +
          `${CRON_ORDER.join(", ")}.`
      )
    }
  }

  // A run left `started` was interrupted: as uncertain as a failed one
  const failed = manifest.runs.find((run) => run.outcome !== "succeeded")
  if (failed) {
    const how = failed.outcome === "failed" ? "e' fallito" : "si e' interrotto"
    throw new Error(
      `Il cron "${failed.job}" ${how} dopo il seed: ${NEW_SEED}. I cron non ` +
        `si ripetono sullo stesso seed perche' \`update\` non e' idempotente ` +
        `(aggiunge un anno alle eta' a ogni esecuzione).`
    )
  }

  const positions = (jobs as CronName[]).map((job) => CRON_ORDER.indexOf(job))
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! <= positions[i - 1]!) {
      throw new Error(
        `I cron richiesti (${jobs.join(", ")}) non sono nell'ordine ` +
          `${CRON_ORDER.join(", ")} o contengono ripetizioni.`
      )
    }
  }

  const attempted = new Set(manifest.runs.map((run) => run.job))
  const lastAttempted = Math.max(
    -1,
    ...manifest.runs.map((run) => CRON_ORDER.indexOf(run.job))
  )
  for (const job of jobs as CronName[]) {
    if (attempted.has(job)) {
      throw new Error(
        `Il cron "${job}" e' gia' stato eseguito dopo il seed: ${NEW_SEED}.`
      )
    }
    if (CRON_ORDER.indexOf(job) < lastAttempted) {
      throw new Error(
        `Il cron "${job}" viene prima di "${CRON_ORDER[lastAttempted]}", ` +
          `gia' eseguito dopo il seed: l'ordine e' ${CRON_ORDER.join(", ")}. ` +
          `Per ripartire ${NEW_SEED}.`
      )
    }
  }
}

/** Prints what the jobs report, as Sentry would get it, and counts it. */
function consoleReporter() {
  const state = { reports: 0 }
  const layer = Layer.succeed(ErrorReporter, {
    report: (cause, data) =>
      Effect.sync(() => {
        state.reports++
        console.error(
          `[cron locale] errore segnalato ${JSON.stringify(data)}\n` +
            Cause.pretty(cause)
        )
      }),
  })
  return { layer, state }
}

const truncate = (text: string) =>
  text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}…` : text

/**
 * The failure of a job, short: the chain of its errors (`Cause.pretty` shows
 * only the outer tagged error, e.g. "CronStepFailed: An error has occurred",
 * not the driver message nested in its `cause`), then `Cause.pretty`.
 */
function describeFailure(cause: Cause.Cause<unknown>): string {
  const chain: string[] = []
  let error: unknown = Cause.squash(cause)
  for (let depth = 0; depth < 5 && error != null; depth++) {
    if (typeof error !== "object") {
      chain.push(String(error))
      break
    }
    const { _tag, step, message } = error as {
      _tag?: unknown
      step?: unknown
      message?: unknown
    }
    const name =
      typeof _tag === "string"
        ? _tag
        : error instanceof Error
          ? error.name
          : "Error"
    const parts = [name]
    if (typeof step === "string") parts.push(`(${step})`)
    if (typeof message === "string" && message !== "") {
      parts.push(`: ${message}`)
    }
    chain.push(parts.join(" ").replace(" :", ":"))
    error = (error as { cause?: unknown }).cause
  }
  return truncate(`${chain.join(" <- ")}\n${Cause.pretty(cause)}`)
}

/**
 * Runs `jobs` on `client`, in order, recording each run in the manifest: a
 * `started` run before the job, closed as `succeeded` (with its counters) or
 * `failed` after it. `onManifest` gets a new manifest at each step, to write
 * it. Throws, before running anything and without calling `onManifest`, if the
 * manifest isn't today's, in the hour where the Rome and UTC days differ, or if
 * the request breaks the order of D6; throws after recording a failed job.
 */
export async function runLocalCrons({
  client,
  manifest,
  jobs,
  now,
  onManifest,
}: {
  client: DbClient
  manifest: Manifest
  jobs: CronName[]
  now: Date
  onManifest: (manifest: Manifest) => void | Promise<void>
}): Promise<Manifest> {
  assertIsToday(manifest.day, now)
  assertSameRomeAndUtcDay(now)
  assertRunnable(manifest, jobs)

  let current: Manifest = { ...manifest, runs: [...manifest.runs] }
  for (const job of jobs) {
    const started: Run = { job, at: now.toISOString(), outcome: "started" }
    current = { ...current, runs: [...current.runs, started] }
    await onManifest(current)

    const reporter = consoleReporter()
    const exit = await Effect.runPromiseExit(
      cronJobs[job]!.run.pipe(
        Effect.provide(
          Layer.mergeAll(Layer.succeed(Db, client), reporter.layer)
        )
      )
    )

    const closed: Run = Exit.isSuccess(exit)
      ? { ...started, outcome: "succeeded", counters: exit.value }
      : {
          ...started,
          outcome: "failed",
          error: describeFailure(exit.cause),
        }
    current = { ...current, runs: [...current.runs.slice(0, -1), closed] }
    await onManifest(current)

    if (Exit.isFailure(exit)) {
      throw new Error(
        `Il cron "${job}" e' fallito (${reporter.state.reports} errori ` +
          `segnalati): i cron successivi non sono stati eseguiti e ${NEW_SEED}.\n` +
          closed.error
      )
    }
  }
  return current
}
