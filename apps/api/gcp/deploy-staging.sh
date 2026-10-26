#!/bin/sh
# Deploys an image of apps/api to mito-crm-staging, by digest:
#   sh apps/api/gcp/deploy-staging.sh <image>@sha256:<digest>
# The workflow deploy-staging.yaml runs it on each merge into dev, after the
# CI, with the image it built; by hand, the image is the one build.sh printed.
# A digest, not a tag: a tag can be moved, the digest is the image.
# 0. With BACKUP=1 (the workflow sets it when the deploy brings migrations,
#    once they are approved) an on-demand backup of the Cloud SQL instance,
#    described as "deploy <COMMIT_SHA>", before the migrations: restoring it
#    is in RESTORE-STAGING.md. If it fails the deploy stops here
# 1. The migrations job applies the pending migrations with the new image
#    (apps/api/src/migrate.ts). If they fail it stops here, and the service
#    keeps its revision. The old revision keeps serving while they run, so a
#    migration must work with the code before it: add, never drop or rename
#    in the deploy of the code that stops using it.
# 2. The new revision is deployed without traffic, tagged, and its /health is
#    checked on the tag's URL. Only then does it take the traffic.
# With COMMIT_SHA set the revision carries the label deployed-sha, which the
# next deploy reads to know the migrations it brings (plan-migrations.ts).
# The values come from the STAGING_* secrets (load-staging-secrets.mjs), which
# only the mito-crm-staging service account can read
set -e
IMAGE=${1:?usage: deploy-staging.sh <image>@sha256:<digest>, as build.sh prints it}
case "$IMAGE" in
  europe-west3-docker.pkg.dev/mito-crm/mito-crm-staging/*@sha256:*) ;;
  *) echo "Not an image of staging's repository by digest: $IMAGE" >&2; exit 1 ;;
esac
P=mito-crm
R=europe-west3
URL=https://mito-crm-staging-869830994359.europe-west3.run.app
# NextAuth builds callbacks, email links and cookies from NEXTAUTH_URL: the
# public address of the frontend, which the Vercel rewrites send here
FRONTEND=https://staging-crm.dbmito.it
INSTANCE=mito-crm:europe-west3:mito-crm-staging
S=STAGING_
# The database is Cloud SQL (B6), through the Unix socket Cloud Run mounts for
# the instance: user mito_app, database mito, password from its secret
# (staging-db-access.sh lets the service account read it and connect)
DB_SECRETS=SUPABASE_MITO_PSW=${S}CLOUDSQL_MITO_APP_PASSWORD:latest
DB_ENV=SUPABASE_DB_CONNECTION_STRING=postgres://mito_app@localhost/mito,INSTANCE_UNIX_SOCKET=/cloudsql/$INSTANCE
# The login, once Vercel sends /api/auth here (BACKEND_AUTH): without these
# the backend has no provider (packages/server/src/auth.ts). The Azure app and
# the SendGrid email link come from the secrets login-staging.sh stores, which
# must exist before the first deploy that passes them, or step 2 fails
LOGIN_SECRETS=$(for name in AZURE_AD_CLIENT_ID AZURE_AD_CLIENT_SECRET \
  AZURE_AD_TENANT_ID SENDGRID_USERNAME SENDGRID_API_KEY SENDGRID_SERVER \
  SENDGRID_PORT; do printf ,%s=%s%s:latest "$name" "$S" "$name"; done)
# Who may sign up without being in the database, as in the Vercel staging
# project. It goes in a --set-env-vars of its own, with ^;^ as the delimiter
# (gcloud topic escaping), so the comma stays in the value; gcloud merges the
# two flags
AUTH_ALLOWED_EMAILS=info@sevedemo.com,info@spatalo.tech

# The workflow reads where the deploy stopped, and the revision serving the
# traffic, for its Slack message (send-deploy-report.ts): it sets these files
phase() {
  if [ -n "$PHASE_FILE" ]; then printf %s "$1" > "$PHASE_FILE"; fi
}

# 0. The backup (setup-deploy-backup.sh lets the deployer take it). Its id,
# for the Slack message, in BACKUP_FILE when the workflow sets it
if [ "$BACKUP" = 1 ]; then
  phase backup
  gcloud sql backups create --instance=mito-crm-staging --project=$P \
    --description="deploy ${COMMIT_SHA:?BACKUP=1 needs COMMIT_SHA}"
  BACKUP_ID=$(gcloud sql backups list --instance=mito-crm-staging --project=$P \
    --filter="description='deploy $COMMIT_SHA'" --sort-by=~windowStartTime \
    --limit=1 --format='value(id)')
  echo "backup $BACKUP_ID"
  if [ -n "$BACKUP_FILE" ]; then printf %s "$BACKUP_ID" > "$BACKUP_FILE"; fi
fi

# 1. The migrations job (setup-ci-deploy.sh created it), with the database only
phase migrazioni
gcloud run jobs update mito-crm-staging-migrate --project=$P --region=$R \
  --image=$IMAGE --command=node --args=apps/api/dist/migrate.js \
  --set-cloudsql-instances=$INSTANCE \
  --set-secrets=$DB_SECRETS --set-env-vars=$DB_ENV,TZ=UTC \
  --quiet
gcloud run jobs execute mito-crm-staging-migrate --project=$P --region=$R \
  --wait

# 2. The service. The crons (apps/api/src/cron) take Cloud Scheduler's OIDC
# token for this URL and service account; the alert cron may take up to 15
# minutes, hence the timeout. The Slack report reads the secret
# STAGING_CRON_SLACK_WEBHOOK_URL, which slack-webhook-staging.sh creates.
# Storage is the GCS bucket storage-staging.sh creates, with the ADC of the
# service account (packages/server/src/services/storage/layer.ts)
# A revision tag starts with a letter: d- and the digest's first 12 characters
phase "revisione Cloud Run"
DIGEST=${IMAGE##*@sha256:}
REVISION_TAG=d-$(printf %s "$DIGEST" | cut -c1-12)
gcloud run deploy mito-crm-staging --project=$P --region=$R \
  --image=$IMAGE \
  --add-cloudsql-instances=$INSTANCE \
  --set-secrets=$DB_SECRETS$LOGIN_SECRETS,SUPABASE_KEY=${S}SUPABASE_KEY:latest,NEXT_PUBLIC_SUPABASE_URL=${S}NEXT_PUBLIC_SUPABASE_URL:latest,NEXTAUTH_SECRET=${S}NEXTAUTH_SECRET:latest,CRON_SLACK_WEBHOOK_URL=${S}CRON_SLACK_WEBHOOK_URL:latest \
  --set-env-vars=$DB_ENV,NEXT_PUBLIC_APP_ENV=staging,NEXTAUTH_URL=$FRONTEND,TZ=UTC,CRON_OIDC_AUDIENCE=$URL,CRON_OIDC_SERVICE_ACCOUNT=mito-crm-scheduler-staging@mito-crm.iam.gserviceaccount.com,CRON_REPORT_ENV=staging,GCS_BUCKET=mito-crm-staging-storage \
  "--set-env-vars=^;^AUTH_ALLOWED_EMAILS=$AUTH_ALLOWED_EMAILS" \
  --timeout=1800 \
  --no-traffic --tag=$REVISION_TAG \
  ${COMMIT_SHA:+--update-labels=deployed-sha=$COMMIT_SHA} \
  --quiet
TAG_URL=$(gcloud run services describe mito-crm-staging --project=$P \
  --region=$R --format=json | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const t = JSON.parse(s).status.traffic.find((t) => t.tag === process.argv[1])
      if (!t?.url) process.exit(1)
      console.log(t.url)
    })' $REVISION_TAG)
phase /health
if ! curl -fsS --retry 3 --retry-all-errors -o /dev/null -w "new revision /health %{http_code}\n" "$TAG_URL/health"; then
  echo "The new revision doesn't answer: the traffic stays on the old one" >&2
  exit 1
fi
# --no-traffic leaves the traffic pinned to a revision: back to the latest
phase "revisione Cloud Run"
gcloud run services update-traffic mito-crm-staging --project=$P --region=$R \
  --to-latest --quiet
gcloud run services update-traffic mito-crm-staging --project=$P --region=$R \
  --remove-tags=$REVISION_TAG --quiet
phase /health
curl -fsS -o /dev/null -w "/health %{http_code}\n" "$URL/health"
if [ -n "$REVISION_FILE" ]; then
  gcloud run services describe mito-crm-staging --project=$P --region=$R \
    --format='value(status.latestReadyRevisionName)' > "$REVISION_FILE"
fi
