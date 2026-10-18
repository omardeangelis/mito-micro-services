#!/bin/sh
# The GCP resources of staging, created once on 2026-10-18 (plan:
# brain/chore/migrazione-gcp.md). It is the record of what exists, and the
# recipe for prod with PROD_ / mito-crm-prod; a second run stops at the first
# resource that already exists.
#
# One project, mito-crm, holds staging and prod, as in sevedemo. They are kept
# apart by resource: a service account, the secrets and, later, the bucket and
# the Cloud SQL instance per environment, and no project-wide role for the
# service accounts of the services.
set -e
P=mito-crm
R=europe-west3

gcloud projects create $P --name="Mito CRM" --organization=815610782062
gcloud billing projects link $P --billing-account=0119A5-06EE33-2A7DFF
gcloud services enable run.googleapis.com iam.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com --project=$P

# Images, built by its own service account (cloudbuild.yaml)
gcloud artifacts repositories create mito-crm --project=$P --location=$R \
  --repository-format=docker
BUILD=mito-crm-build@$P.iam.gserviceaccount.com
gcloud iam service-accounts create mito-crm-build --project=$P
gcloud artifacts repositories add-iam-policy-binding mito-crm --project=$P \
  --location=$R --member=serviceAccount:$BUILD --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$BUILD \
  --role=roles/logging.logWriter --condition=None
# The sources build.sh uploads, deleted after 7 days
gcloud storage buckets create gs://mito-crm-build-source --project=$P \
  --location=$R --uniform-bucket-level-access --public-access-prevention
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > /tmp/mito-lifecycle.json
gcloud storage buckets update gs://mito-crm-build-source --lifecycle-file=/tmp/mito-lifecycle.json
gcloud storage buckets add-iam-policy-binding gs://mito-crm-build-source \
  --member=serviceAccount:$BUILD --role=roles/storage.objectViewer

# The service, public: the Vercel rewrites send no token, and the session
# cookie protects the API. The first deploy is Google's sample image; the
# backend comes with deploy-staging.sh
SA=mito-crm-staging@$P.iam.gserviceaccount.com
gcloud iam service-accounts create mito-crm-staging --project=$P
gcloud run deploy mito-crm-staging --project=$P --region=$R \
  --image=us-docker.pkg.dev/cloudrun/container/hello --service-account=$SA \
  --no-invoker-iam-check --ingress=all --max-instances=2 --cpu=1 \
  --memory=512Mi --cpu-boost --quiet

# Its secrets, in the region only, readable by its service account only. The
# values come from load-staging-secrets.mjs, which Leonardo runs
for name in SUPABASE_DB_CONNECTION_STRING SUPABASE_MITO_PSW SUPABASE_KEY \
  NEXT_PUBLIC_SUPABASE_URL NEXTAUTH_SECRET; do
  gcloud secrets create STAGING_$name --project=$P \
    --replication-policy=user-managed --locations=$R --labels=env=staging
  gcloud secrets add-iam-policy-binding STAGING_$name --project=$P \
    --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor \
    --condition=None
done
