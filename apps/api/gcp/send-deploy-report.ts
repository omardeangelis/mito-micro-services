import { type ApiPhase, type JobResult, deployReport } from "./lib/deployReport"

// The last job of deploy-staging.yaml: posts one Slack message per run, with
// the results of the jobs before it. It never fails the run: a deploy that
// went through stays green when Slack doesn't answer (::warning::). The
// webhook comes from the secret SLACK_DEPLOY_WEBHOOK_URL and is never printed
const env = process.env
const result = (name: string) => (env[name] ?? "skipped") as JobResult

const report = deployReport({
  environment: env.DEPLOY_ENVIRONMENT ?? "?",
  ci: result("CI_RESULT"),
  api: result("API_RESULT"),
  apiPhase: (env.API_PHASE ?? "") as ApiPhase | "",
  vercel: result("VERCEL_RESULT"),
  commit: {
    sha: env.GITHUB_SHA ?? "",
    title: (env.COMMIT_MESSAGE ?? "").split("\n")[0] ?? "",
  },
  actor: env.GITHUB_ACTOR ?? "?",
  revision: env.API_REVISION ?? "",
  runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
})
console.log(report.text)

const webhookUrl = env.SLACK_WEBHOOK_URL?.trim()
if (!webhookUrl) {
  console.log("::warning::SLACK_DEPLOY_WEBHOOK_URL is not set: no message sent")
} else {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: report.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      console.log(
        `::warning::Slack answered ${response.status}: no message sent`
      )
  } catch (error) {
    console.log(
      `::warning::Slack didn't answer (${error instanceof Error ? error.name : "error"}): no message sent`
    )
  }
}
