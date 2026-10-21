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

# The crons (B5): Cloud Scheduler calls /internal/cron/<job> with an OIDC token
# of its own service account, which the backend checks (CRON_OIDC_* in
# deploy-staging.sh). The service account needs no role: the service is
# public and the token is the check. No retry: a failed run waits for the next
# day or a "Force run". Same UTC times as the GitHub crons; the jobs start
# paused, and are resumed when staging takes over its crons
gcloud services enable cloudscheduler.googleapis.com --project=$P
SCHED=mito-crm-scheduler-staging@$P.iam.gserviceaccount.com
gcloud iam service-accounts create mito-crm-scheduler-staging --project=$P
URL=https://mito-crm-staging-869830994359.europe-west3.run.app
for job in "priority|17 23 * * *" "alert|47 23 * * *" \
  "update|17 0 * * *" "delete-export|47 0 * * *"; do
  name=${job%%|*}
  gcloud scheduler jobs create http mito-crm-staging-$name --project=$P \
    --location=$R --schedule="${job#*|}" --time-zone=Etc/UTC \
    --uri=$URL/internal/cron/$name --http-method=POST \
    --oidc-service-account-email=$SCHED --oidc-token-audience=$URL \
    --attempt-deadline=30m --max-retry-attempts=0
  gcloud scheduler jobs pause mito-crm-staging-$name --project=$P --location=$R
done

# The database (B6): Cloud SQL Enterprise, Postgres 15 as Supabase. Shared core
# (db-g1-small) for staging, zonal: HA only in prod. Backups at 03:00 UTC, after
# the crons, with PITR on 7 days of logs. Public IP with no authorized network:
# only the Cloud SQL connectors get in (Cloud Run's socket, the Auth Proxy),
# with a client certificate. The database and the mito_app user come after,
# from create-staging-db.mjs, which keeps the password out of command lines
gcloud services enable sqladmin.googleapis.com --project=$P
gcloud sql instances create mito-crm-staging --project=$P --region=$R \
  --database-version=POSTGRES_15 --edition=ENTERPRISE --tier=db-g1-small \
  --availability-type=ZONAL --storage-type=SSD --storage-size=10 \
  --storage-auto-increase --backup-start-time=03:00 \
  --enable-point-in-time-recovery --retained-backups-count=7 \
  --retained-transaction-log-days=7 --deletion-protection \
  --ssl-mode=TRUSTED_CLIENT_CERTIFICATE_REQUIRED \
  --maintenance-window-day=SUN --maintenance-window-hour=4
