/** How a job of the deploy workflow ended (`needs.<job>.result`). */
export type JobResult = "success" | "failure" | "cancelled" | "skipped"

/**
 * Where the backend deploy stopped: `deploy-staging.sh` writes it before
 * each step, so when the job fails it names the step that failed.
 */
export type ApiPhase =
  "immagine" | "migrazioni" | "revisione Cloud Run" | "/health"

export type DeployRun = {
  /** staging, later prod: the first word of every message */
  environment: string
  ci: JobResult
  api: JobResult
  /** Empty when the API job never started */
  apiPhase: ApiPhase | ""
  vercel: JobResult
  commit: { sha: string; title: string }
  /** Who merged, or who started the run by hand */
  actor: string
  /** The revision serving the traffic, once the backend is deployed */
  revision: string
  runUrl: string
}

export type DeployReport = {
  outcome: "succeeded" | "failed" | "cancelled"
  /** Where the deploy stopped, when it didn't succeed */
  phase?: string
  text: string
}

const ICONS = {
  succeeded: ":white_check_mark:",
  failed: ":rotating_light:",
  cancelled: ":white_circle:",
} as const

const OUTCOMES = {
  succeeded: "deploy riuscito",
  failed: "deploy fallito",
  cancelled: "deploy annullato",
} as const

/** The job that didn't succeed first, in the workflow's order, and its phase. */
function stoppedAt(run: DeployRun) {
  if (run.ci !== "success") return { result: run.ci, phase: "CI" }
  if (run.api !== "success")
    return { result: run.api, phase: run.apiPhase || "immagine" }
  if (run.vercel !== "success") return { result: run.vercel, phase: "Vercel" }
  return undefined
}

/**
 * The Slack message of a deploy run: one per run, whether it succeeded,
 * failed or was cancelled. A job skipped because the one before it didn't
 * succeed is never the cause, since the one before is found first.
 */
export function deployReport(run: DeployRun): DeployReport {
  const stop = stoppedAt(run)
  const outcome = !stop
    ? "succeeded"
    : stop.result === "cancelled"
      ? "cancelled"
      : "failed"
  const sha = run.commit.sha.slice(0, 7)
  const title = `${ICONS[outcome]} *${run.environment} · ${OUTCOMES[outcome]}*${
    stop ? ` nella fase *${stop.phase}*` : ""
  }`
  const lines = [
    title,
    `• commit: \`${sha}\` ${run.commit.title}`,
    `• avviato da: ${run.actor}`,
  ]
  if (!stop && run.revision) lines.push(`• revisione: ${run.revision}`)
  lines.push(`• run: <${run.runUrl}|GitHub Actions>`)
  return { outcome, phase: stop?.phase, text: lines.join("\n") }
}
