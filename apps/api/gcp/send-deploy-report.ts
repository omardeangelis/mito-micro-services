import { type ApiPhase, type JobResult, deployReport } from "./lib/deployReport"
import { postToSlack } from "./lib/slack"

// The last job of deploy-staging.yaml: posts one Slack message per run, with
// the results of the jobs before it. It never fails the run: a deploy that
// went through stays green when Slack doesn't answer (::warning::). The
// webhook comes from the secret SLACK_DEPLOY_WEBHOOK_URL and is never printed
const env = process.env
const result = (name: string) => (env[name] ?? "skipped") as JobResult

const report = deployReport({
  environment: env.DEPLOY_ENVIRONMENT ?? "?",
  ci: result("CI_RESULT"),
  plan: result("PLAN_RESULT"),
  pending: Number(env.PENDING ?? 0),
  approve: result("APPROVE_RESULT"),
  api: result("API_RESULT"),
  apiPhase: (env.API_PHASE ?? "") as ApiPhase | "",
  vercel: result("VERCEL_RESULT"),
  commit: {
    sha: env.GITHUB_SHA ?? "",
    title: (env.COMMIT_MESSAGE ?? "").split("\n")[0] ?? "",
  },
  actor: env.GITHUB_ACTOR ?? "?",
  revision: env.API_REVISION ?? "",
  backup: env.API_BACKUP ?? "",
  runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
})
console.log(report.text)
await postToSlack(env.SLACK_WEBHOOK_URL, report.text)
