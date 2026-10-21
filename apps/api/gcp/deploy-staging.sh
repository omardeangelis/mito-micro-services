#!/bin/sh
# Deploys an image built by build.sh to mito-crm-staging:
#   sh apps/api/gcp/deploy-staging.sh <tag>
# The values come from the STAGING_* secrets (load-staging-secrets.mjs), which
# only the mito-crm-staging service account can read
set -e
TAG=${1:?usage: deploy-staging.sh <tag>, the commit build.sh printed}
URL=https://mito-crm-staging-869830994359.europe-west3.run.app
# NextAuth builds callbacks, email links and cookies from NEXTAUTH_URL: the
# public address of the frontend, which the Vercel rewrites send here
FRONTEND=https://staging-crm.dbmito.it
INSTANCE=mito-crm:europe-west3:mito-crm-staging
S=STAGING_
# The crons (apps/api/src/cron) take Cloud Scheduler's OIDC token for this URL and
# service account; the alert cron may take up to 15 minutes, hence the timeout.
# The Slack report reads the secret STAGING_CRON_SLACK_WEBHOOK_URL, which
# slack-webhook-staging.sh creates.
# The database is Cloud SQL (B6), through the Unix socket Cloud Run mounts for
# the instance: user mito_app, database mito, password from its secret
# (staging-db-access.sh lets the service account read it and connect)
# Storage is the GCS bucket storage-staging.sh creates, with the ADC of the
# service account (src/server/services/storage/layer.ts)
gcloud run deploy mito-crm-staging --project=mito-crm --region=europe-west3 \
  --image=europe-west3-docker.pkg.dev/mito-crm/mito-crm/mito-api:$TAG \
  --add-cloudsql-instances=$INSTANCE \
  --set-secrets=SUPABASE_MITO_PSW=${S}CLOUDSQL_MITO_APP_PASSWORD:latest,SUPABASE_KEY=${S}SUPABASE_KEY:latest,NEXT_PUBLIC_SUPABASE_URL=${S}NEXT_PUBLIC_SUPABASE_URL:latest,NEXTAUTH_SECRET=${S}NEXTAUTH_SECRET:latest,CRON_SLACK_WEBHOOK_URL=${S}CRON_SLACK_WEBHOOK_URL:latest \
  --set-env-vars=NEXT_PUBLIC_APP_ENV=staging,NEXTAUTH_URL=$FRONTEND,SUPABASE_DB_CONNECTION_STRING=postgres://mito_app@localhost/mito,INSTANCE_UNIX_SOCKET=/cloudsql/$INSTANCE,TZ=UTC,CRON_OIDC_AUDIENCE=$URL,CRON_OIDC_SERVICE_ACCOUNT=mito-crm-scheduler-staging@mito-crm.iam.gserviceaccount.com,CRON_REPORT_ENV=staging,GCS_BUCKET=mito-crm-staging-storage \
  --timeout=1800 \
  --quiet
curl -fsS -o /dev/null -w "/health %{http_code}\n" "$URL/health"
