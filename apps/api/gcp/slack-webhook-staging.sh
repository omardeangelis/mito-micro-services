#!/bin/sh
# Connects the cron reports of mito-crm-staging to #mito-cron-staging. Run it
# once the Slack Incoming Webhook exists, and again to replace it:
#   sh apps/api/gcp/slack-webhook-staging.sh
# It asks for the webhook URL without echoing it, so it stays out of the shell
# history and the repo. It stores the URL in the secret
# STAGING_CRON_SLACK_WEBHOOK_URL (readable by the service account of staging
# only), and gives it to the running service as CRON_SLACK_WEBHOOK_URL with a
# new revision, keeping its other secrets. deploy-staging.sh passes the same
# secret on every deploy.
set -e
P=mito-crm
R=europe-west3
SA=mito-crm-staging@$P.iam.gserviceaccount.com
SECRET=STAGING_CRON_SLACK_WEBHOOK_URL

printf "Webhook URL of #mito-cron-staging: "
stty -echo 2>/dev/null || true
read -r WEBHOOK || [ -n "$WEBHOOK" ]
stty echo 2>/dev/null || true
echo
case "$WEBHOOK" in
  https://hooks.slack.com/services/*) ;;
  *) echo "Not a Slack Incoming Webhook URL (https://hooks.slack.com/services/...)" >&2; exit 1 ;;
esac

if ! gcloud secrets describe $SECRET --project=$P >/dev/null 2>&1; then
  gcloud secrets create $SECRET --project=$P \
    --replication-policy=user-managed --locations=$R --labels=env=staging
  gcloud secrets add-iam-policy-binding $SECRET --project=$P \
    --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor \
    --condition=None
fi
printf %s "$WEBHOOK" | gcloud secrets versions add $SECRET --project=$P --data-file=-

gcloud run services update mito-crm-staging --project=$P --region=$R \
  --update-secrets=CRON_SLACK_WEBHOOK_URL=$SECRET:latest --quiet
echo "Done: the next cron run posts its report to #mito-cron-staging"
