import { Context, Effect, Layer } from "effect"

/** How a cron call ended. `counters` holds counts only, never rows' data. */
export type CronOutcome = {
  job: string
  status: "succeeded" | "failed" | "skipped"
  durationMs: number
  counters: Record<string, number>
}

/**
 * Tells the team about every cron call, succeeded, failed or skipped: the
 * channel is the record of what runs and when, so a missing message is a
 * signal too. It never fails: a report must not break the job it tells about.
 */
export class CronReport extends Context.Service<
  CronReport,
  { readonly send: (outcome: CronOutcome) => Effect.Effect<void> }
>()("CronReport") {}

const ICONS = {
  succeeded: ":white_check_mark:",
  failed: ":rotating_light:",
  skipped: ":information_source:",
} as const

const STATUS = {
  succeeded: "riuscito",
  failed: "fallito",
  skipped: "saltato: ha già girato oggi",
} as const

/** The Slack message of an outcome, for the environment `environment`. */
export const formatReport = (environment: string, outcome: CronOutcome) => {
  const seconds = (outcome.durationMs / 1000).toFixed(1)
  const lines = [
    `${ICONS[outcome.status]} *cron ${outcome.job}* (${environment}): ${STATUS[outcome.status]} · ${seconds} s`,
  ]
  for (const [name, value] of Object.entries(outcome.counters)) {
    lines.push(`• ${name}: ${value}`)
  }
  return lines.join("\n")
}

const logOutcome = (outcome: CronOutcome) =>
  Effect.logInfo(`Cron ${outcome.job}: ${outcome.status}`).pipe(
    Effect.annotateLogs({
      durationMs: outcome.durationMs,
      ...outcome.counters,
    })
  )

/** Writes each outcome to the log only. */
export const logReport = Layer.succeed(CronReport, { send: logOutcome })

/** Writes each outcome to the log and posts it to a Slack webhook. */
export const slackReport = ({
  webhookUrl,
  environment,
}: {
  webhookUrl: string
  environment: string
}) =>
  Layer.succeed(CronReport, {
    send: (outcome) =>
      logOutcome(outcome).pipe(
        Effect.andThen(
          Effect.tryPromise(() =>
            fetch(webhookUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                text: formatReport(environment, outcome),
              }),
              signal: AbortSignal.timeout(5_000),
            })
          )
        ),
        Effect.flatMap((response) =>
          response.ok
            ? Effect.void
            : Effect.fail(new Error(`Slack answered ${response.status}`))
        ),
        Effect.catch((error) =>
          Effect.logWarning("Cron report not sent to Slack", error)
        )
      ),
  })
