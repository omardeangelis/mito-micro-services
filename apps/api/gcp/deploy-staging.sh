#!/bin/sh
# Deploys an image of apps/api to mito-crm-staging:
#   sh apps/api/gcp/deploy-staging.sh <tag>
# The workflow deploy-api-staging.yml runs it on each merge into dev, with the
# image it built; by hand, the tag is the commit build.sh printed.
# 1. The migrations job applies the pending migrations with the new image
#    (apps/api/src/migrate.ts). If they fail it stops here, and the service
#    keeps its revision. The old revision keeps serving while they run, so a
#    migration must work with the code before it: add, never drop or rename
#    in the deploy of the code that stops using it.
# 2. The new revision is deployed without traffic, tagged, and its /health is
#    checked on the tag's URL. Only then does it take the traffic.
# The values come from the STAGING_* secrets (load-staging-secrets.mjs), which
# only the mito-crm-staging service account can read
set -e
TAG=${1:?usage: deploy-staging.sh <tag>, the commit build.sh printed}
P=mito-crm
R=europe-west3
IMAGE=europe-west3-docker.pkg.dev/mito-crm/mito-crm/mito-api:$TAG
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

# 1. The migrations job (setup-ci-deploy.sh created it), with the database only
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
# A revision tag starts with a letter
REVISION_TAG=sha-$TAG
gcloud run deploy mito-crm-staging --project=$P --region=$R \
  --image=$IMAGE \
  --add-cloudsql-instances=$INSTANCE \
  --set-secrets=$DB_SECRETS,SUPABASE_KEY=${S}SUPABASE_KEY:latest,NEXT_PUBLIC_SUPABASE_URL=${S}NEXT_PUBLIC_SUPABASE_URL:latest,NEXTAUTH_SECRET=${S}NEXTAUTH_SECRET:latest,CRON_SLACK_WEBHOOK_URL=${S}CRON_SLACK_WEBHOOK_URL:latest \
  --set-env-vars=$DB_ENV,NEXT_PUBLIC_APP_ENV=staging,NEXTAUTH_URL=$FRONTEND,TZ=UTC,CRON_OIDC_AUDIENCE=$URL,CRON_OIDC_SERVICE_ACCOUNT=mito-crm-scheduler-staging@mito-crm.iam.gserviceaccount.com,CRON_REPORT_ENV=staging,GCS_BUCKET=mito-crm-staging-storage \
  --timeout=1800 \
  --no-traffic --tag=$REVISION_TAG \
  --quiet
TAG_URL=$(gcloud run services describe mito-crm-staging --project=$P \
  --region=$R --format=json | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const t = JSON.parse(s).status.traffic.find((t) => t.tag === process.argv[1])
      if (!t?.url) process.exit(1)
      console.log(t.url)
    })' $REVISION_TAG)
if ! curl -fsS --retry 3 --retry-all-errors -o /dev/null -w "new revision /health %{http_code}\n" "$TAG_URL/health"; then
  echo "The new revision doesn't answer: the traffic stays on the old one" >&2
  exit 1
fi
# --no-traffic leaves the traffic pinned to a revision: back to the latest
gcloud run services update-traffic mito-crm-staging --project=$P --region=$R \
  --to-latest --quiet
gcloud run services update-traffic mito-crm-staging --project=$P --region=$R \
  --remove-tags=$REVISION_TAG --quiet
curl -fsS -o /dev/null -w "/health %{http_code}\n" "$URL/health"
