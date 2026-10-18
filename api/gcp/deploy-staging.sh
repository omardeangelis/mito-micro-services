#!/bin/sh
# Deploys an image built by build.sh to mito-crm-staging:
#   sh api/gcp/deploy-staging.sh <tag>
# The values come from the STAGING_* secrets (load-staging-secrets.mjs), which
# only the mito-crm-staging service account can read
set -e
TAG=${1:?usage: deploy-staging.sh <tag>, the commit build.sh printed}
S=STAGING_
gcloud run deploy mito-crm-staging --project=mito-crm --region=europe-west3 \
  --image=europe-west3-docker.pkg.dev/mito-crm/mito-crm/mito-api:$TAG \
  --set-secrets=SUPABASE_DB_CONNECTION_STRING=${S}SUPABASE_DB_CONNECTION_STRING:latest,SUPABASE_MITO_PSW=${S}SUPABASE_MITO_PSW:latest,SUPABASE_KEY=${S}SUPABASE_KEY:latest,NEXT_PUBLIC_SUPABASE_URL=${S}NEXT_PUBLIC_SUPABASE_URL:latest,NEXTAUTH_SECRET=${S}NEXTAUTH_SECRET:latest \
  --set-env-vars=NEXT_PUBLIC_APP_ENV=staging,NEXTAUTH_URL=https://mito-crm-staging-869830994359.europe-west3.run.app \
  --quiet
URL=https://mito-crm-staging-869830994359.europe-west3.run.app
curl -fsS -o /dev/null -w "/health %{http_code}\n" "$URL/health"
