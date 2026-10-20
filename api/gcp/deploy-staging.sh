#!/bin/sh
# Deploys an image built by build.sh to mito-crm-staging:
#   sh api/gcp/deploy-staging.sh <tag>
# The values come from the STAGING_* secrets (load-staging-secrets.mjs), which
# only the mito-crm-staging service account can read
set -e
TAG=${1:?usage: deploy-staging.sh <tag>, the commit build.sh printed}
URL=https://mito-crm-staging-869830994359.europe-west3.run.app
S=STAGING_
# The crons (api/src/cron) take Cloud Scheduler's OIDC token for this URL and
# service account; the alert cron may take up to 15 minutes, hence the timeout.
# The Slack report reads the secret STAGING_CRON_SLACK_WEBHOOK_URL, which
# slack-webhook-staging.sh creates
gcloud run deploy mito-crm-staging --project=mito-crm --region=europe-west3 \
  --image=europe-west3-docker.pkg.dev/mito-crm/mito-crm/mito-api:$TAG \
  --set-secrets=SUPABASE_DB_CONNECTION_STRING=${S}SUPABASE_DB_CONNECTION_STRING:latest,SUPABASE_MITO_PSW=${S}SUPABASE_MITO_PSW:latest,SUPABASE_KEY=${S}SUPABASE_KEY:latest,NEXT_PUBLIC_SUPABASE_URL=${S}NEXT_PUBLIC_SUPABASE_URL:latest,NEXTAUTH_SECRET=${S}NEXTAUTH_SECRET:latest,CRON_SLACK_WEBHOOK_URL=${S}CRON_SLACK_WEBHOOK_URL:latest \
  --set-env-vars=NEXT_PUBLIC_APP_ENV=staging,NEXTAUTH_URL=$URL,TZ=UTC,CRON_OIDC_AUDIENCE=$URL,CRON_OIDC_SERVICE_ACCOUNT=mito-crm-scheduler-staging@mito-crm.iam.gserviceaccount.com,CRON_REPORT_ENV=staging \
  --timeout=1800 \
  --quiet
curl -fsS -o /dev/null -w "/health %{http_code}\n" "$URL/health"
