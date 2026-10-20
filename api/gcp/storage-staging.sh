#!/bin/sh
# The GCS bucket of staging (B3b in brain/chore/migrazione-gcp.md), which
# replaces the Supabase bucket "mito-storage" there. Run it once, from a
# shell where gcloud is signed in:
#   sh api/gcp/storage-staging.sh
# A second run stops at the bucket, which already exists. The backend uses
# it when GCS_BUCKET is set (src/server/services/storage/layer.ts).
set -e
P=mito-crm
R=europe-west3
SA=mito-crm-staging@$P.iam.gserviceaccount.com
BUCKET=mito-crm-staging-storage

# Private: no ACLs (UBLA) and no public access, whatever IAM says
gcloud storage buckets create gs://$BUCKET --project=$P --location=$R \
  --uniform-bucket-level-access --public-access-prevention
# Not on create: older gcloud versions don't take --labels there
gcloud storage buckets update gs://$BUCKET --update-labels=env=staging

# The browser uploads with a signed URL (PUT) and downloads with one (GET)
cat > /tmp/mito-storage-cors.json <<'JSON'
[{"origin":["https://staging-crm.dbmito.it","http://localhost:3000"],
  "method":["GET","PUT"],
  "responseHeader":["Content-Type","Content-Disposition"],
  "maxAgeSeconds":3600}]
JSON
gcloud storage buckets update gs://$BUCKET --cors-file=/tmp/mito-storage-cors.json

# The exports are temporary: besides the delete cron, GCS drops them after a day
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":1,"matchesPrefix":["export/"]}}]}' \
  > /tmp/mito-storage-lifecycle.json
gcloud storage buckets update gs://$BUCKET \
  --lifecycle-file=/tmp/mito-storage-lifecycle.json

# Only the service account of staging reads and writes, on this bucket only
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
# On Cloud Run the signed URLs are signed with the ADC, through signBlob on
# the service account itself
gcloud iam service-accounts add-iam-policy-binding $SA --project=$P \
  --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator
gcloud services enable iamcredentials.googleapis.com --project=$P

echo "Bucket gs://$BUCKET ready. The service needs GCS_BUCKET=$BUCKET (deploy-staging.sh)."
