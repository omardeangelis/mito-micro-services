#!/bin/sh
# The queue of staging's imports (spec import-pratiche, D1 and D13), once,
# before the backend that uses it:
#   sh apps/api/gcp/setup-import-queue.sh
# - The Cloud Tasks queue mito-crm-staging-import: one delivery at a time
#   (an import at a time, D7), 3 attempts with backoff when a delivery
#   doesn't arrive. The backend answers 2xx also when an import fails, so a
#   failed import isn't tried again.
# - Its own service account, mito-crm-import-tasks-staging, whose OIDC token
#   the tasks carry and the backend checks on /internal/import/* (with the
#   service's URL as audience, IMPORT_OIDC_* in deploy-staging.sh). It needs
#   no role: the service is public and the token is the check, as for the
#   crons' mito-crm-scheduler-staging.
# - The backend's service account may put tasks in this queue only, and sign
#   them as that service account only. The Cloud Tasks service agent mints
#   the tokens with the role Google grants it when the API is enabled.
# Without it the backend still starts, with the queue off (D13): import.start
# answers that the import isn't available. A second run updates the queue and
# adds the bindings again, which changes nothing.
set -e
P=mito-crm
R=europe-west3
QUEUE=mito-crm-staging-import
SA=mito-crm-staging@$P.iam.gserviceaccount.com
TASKS=mito-crm-import-tasks-staging@$P.iam.gserviceaccount.com
QUEUE_SETTINGS="--max-attempts=3 --min-backoff=10s --max-backoff=300s --max-doublings=3 --max-concurrent-dispatches=1 --max-dispatches-per-second=1"

gcloud services enable cloudtasks.googleapis.com --project=$P

if gcloud tasks queues describe $QUEUE --project=$P --location=$R >/dev/null 2>&1; then
  gcloud tasks queues update $QUEUE --project=$P --location=$R $QUEUE_SETTINGS >/dev/null
else
  gcloud tasks queues create $QUEUE --project=$P --location=$R $QUEUE_SETTINGS
fi

if ! gcloud iam service-accounts describe $TASKS --project=$P >/dev/null 2>&1; then
  gcloud iam service-accounts create mito-crm-import-tasks-staging --project=$P \
    --display-name="OIDC token of staging's import tasks"
fi

gcloud tasks queues add-iam-policy-binding $QUEUE --project=$P --location=$R \
  --member=serviceAccount:$SA --role=roles/cloudtasks.enqueuer >/dev/null
gcloud iam service-accounts add-iam-policy-binding $TASKS --project=$P \
  --member=serviceAccount:$SA --role=roles/iam.serviceAccountUser \
  --condition=None >/dev/null

gcloud tasks queues describe $QUEUE --project=$P --location=$R \
  --format='yaml(name,rateLimits.maxConcurrentDispatches,retryConfig.maxAttempts)'
echo "Done: $SA puts tasks in $QUEUE, signed as $TASKS"
