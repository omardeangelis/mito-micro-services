/** A backup of the Cloud SQL instance, as `gcloud sql backups list` gives it. */
export type BackupRun = {
  id: string
  type: string
  description?: string
  windowStartTime: string
}

/** deploy-staging.sh describes its backups as "deploy <sha>". */
const DEPLOY_PREFIX = "deploy "
const MAX_AGE_MS = 7 * 86_400_000
const KEEP = 3

/**
 * The backups the weekly cleanup deletes: those the deploy took, older than 7
 * days, but never the 3 most recent of them. Automated backups and those
 * taken by hand are never picked.
 */
export function backupsToDelete(backups: BackupRun[], now: Date) {
  const time = (b: BackupRun) => new Date(b.windowStartTime).getTime()
  return backups
    .filter(
      (b) => b.type === "ON_DEMAND" && b.description?.startsWith(DEPLOY_PREFIX)
    )
    .sort((a, b) => time(b) - time(a))
    .slice(KEEP)
    .filter((b) => now.getTime() - time(b) > MAX_AGE_MS)
    .reverse()
}
