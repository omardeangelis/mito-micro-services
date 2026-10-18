import { Layer } from "effect"
import { ServerLive } from "@/server/effect/server"
import { cronAuth, cronAuthDisabled, googleKeys } from "./auth"
import { logReport, slackReport } from "./report"
import { type CronContext } from "./routes"

/**
 * The services of the cron routes, from the env of the service:
 * - CRON_OIDC_AUDIENCE and CRON_OIDC_SERVICE_ACCOUNT: the audience and the
 *   service account of Cloud Scheduler's tokens. Without both, every cron
 *   request is refused;
 * - CRON_SLACK_WEBHOOK_URL (a secret) and CRON_REPORT_ENV (staging, prod):
 *   where the reports go and how they name the environment. Without the
 *   webhook they go to the log only.
 */
export const cronLive = (env: NodeJS.ProcessEnv): Layer.Layer<CronContext> => {
  const audience = env.CRON_OIDC_AUDIENCE?.trim()
  const serviceAccount = env.CRON_OIDC_SERVICE_ACCOUNT?.trim()
  const webhookUrl = env.CRON_SLACK_WEBHOOK_URL?.trim()
  return Layer.mergeAll(
    ServerLive,
    audience && serviceAccount
      ? cronAuth({ audience, serviceAccount }, googleKeys())
      : cronAuthDisabled,
    webhookUrl
      ? slackReport({ webhookUrl, environment: env.CRON_REPORT_ENV ?? "?" })
      : logReport
  )
}
