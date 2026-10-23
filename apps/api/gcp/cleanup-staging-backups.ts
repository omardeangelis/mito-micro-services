import { execFileSync } from "node:child_process"
import { type BackupRun, backupsToDelete } from "./lib/backupsToDelete"
import { postToSlack } from "./lib/slack"

// The weekly job of cleanup-staging-backups.yaml: deletes the backups the
// deploy of staging took before its migrations (deploy-staging.sh), older than
// 7 days, keeping the last 3, and tells Slack how many, or why it failed.
// It runs as mito-crm-backup-cleaner (setup-backup-cleanup.sh)
const env = process.env
const INSTANCE = ["--instance=mito-crm-staging", "--project=mito-crm"]
const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
const gcloud = (args: string[]) =>
  execFileSync("gcloud", [...args, ...INSTANCE], { encoding: "utf8" })

const deleted: string[] = []
try {
  const backups = JSON.parse(
    gcloud(["sql", "backups", "list", "--format=json"])
  ) as BackupRun[]
  for (const backup of backupsToDelete(backups, new Date())) {
    console.log(`Deleting ${backup.id} (${backup.description})`)
    gcloud(["sql", "backups", "delete", backup.id, "--quiet"])
    deleted.push(backup.id)
  }
  const text = `:broom: *staging · pulizia backup*: ${deleted.length} ${
    deleted.length === 1 ? "backup cancellato" : "backup cancellati"
  }\n• run: <${runUrl}|GitHub Actions>`
  console.log(text)
  await postToSlack(env.SLACK_WEBHOOK_URL, text)
} catch (error) {
  const cause = error instanceof Error ? error.message.split("\n")[0] : "?"
  console.log(`::error::${cause}`)
  await postToSlack(
    env.SLACK_WEBHOOK_URL,
    `:rotating_light: *staging · pulizia backup fallita* dopo ${deleted.length} cancellati: ${cause}\n• run: <${runUrl}|GitHub Actions>`
  )
  process.exitCode = 1
}
