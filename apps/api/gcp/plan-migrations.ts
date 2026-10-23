import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import path from "node:path"
import { waitingReport } from "./lib/deployReport"
import {
  type Journal,
  pendingMigrations,
  pendingSummary,
} from "./lib/pendingMigrations"
import { postToSlack } from "./lib/slack"

// The Plan job of deploy-staging.yaml: lists the migrations this deploy brings
// to staging, against the commit staging runs (DEPLOYED_SHA, the label
// deployed-sha of the service, which deploy-staging.sh sets). It writes them
// with their SQL in the summary of the run, for whoever approves, sets the
// output `pending`, and tells Slack when the deploy waits for an approval.
// Needs the whole history of the checkout (fetch-depth: 0)
const env = process.env
const FOLDER = "packages/db/migrations"
const JOURNAL = `${FOLDER}/meta/_journal.json`

/** The journal at `sha`, or undefined when the history doesn't have it. */
function journalAt(sha: string): Journal | undefined {
  if (!sha) return undefined
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${sha}:${JOURNAL}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
    ) as Journal
  } catch {
    console.log(
      `::warning::${sha} is not in the history: every migration counts`
    )
    return undefined
  }
}

const deployedSha = env.DEPLOYED_SHA?.trim() ?? ""
const current = JSON.parse(readFileSync(JOURNAL, "utf8")) as Journal
const pending = pendingMigrations(journalAt(deployedSha), current, (tag) =>
  readFileSync(path.join(FOLDER, `${tag}.sql`), "utf8")
)

const summary = pendingSummary(pending, deployedSha)
console.log(summary)
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary)
if (env.GITHUB_OUTPUT)
  appendFileSync(env.GITHUB_OUTPUT, `pending=${pending.length}\n`)

if (pending.length > 0) {
  await postToSlack(
    env.SLACK_WEBHOOK_URL,
    waitingReport({
      environment: env.DEPLOY_ENVIRONMENT ?? "?",
      pending: pending.length,
      commit: {
        sha: env.GITHUB_SHA ?? "",
        title: (env.COMMIT_MESSAGE ?? "").split("\n")[0] ?? "",
      },
      actor: env.GITHUB_ACTOR ?? "?",
      runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    })
  )
}
