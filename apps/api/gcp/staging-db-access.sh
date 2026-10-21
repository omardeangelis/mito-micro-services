#!/bin/sh
# Lets mito-crm-staging use Cloud SQL (B6), once, before the first
# deploy-staging.sh on the database:
#   sh apps/api/gcp/staging-db-access.sh
# - roles/cloudsql.client to the service account of the service, with a
#   condition on the staging instance: no role on the rest of the project;
# - read access to the secret with the password of mito_app, to that service
#   account only (create-staging-db-user.mjs created it without readers).
# Running it again changes nothing
set -e
P=mito-crm
SA=mito-crm-staging@$P.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding $P \
  --member=serviceAccount:$SA --role=roles/cloudsql.client \
  --condition='expression=resource.name == "projects/mito-crm/instances/mito-crm-staging" && resource.type == "sqladmin.googleapis.com/Instance",title=mito-crm-staging-only' \
  --quiet >/dev/null
gcloud secrets add-iam-policy-binding STAGING_CLOUDSQL_MITO_APP_PASSWORD \
  --project=$P --member=serviceAccount:$SA \
  --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
echo "Done: deploy-staging.sh can now point mito-crm-staging at Cloud SQL"
