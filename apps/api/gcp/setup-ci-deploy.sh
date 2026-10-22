#!/bin/sh
# Lets GitHub Actions deploy mito-crm-staging, once, before the first run of
# the deploy workflow (deploy-staging.yaml):
#   sh apps/api/gcp/setup-ci-deploy.sh
# - Workload Identity Federation: GitHub's OIDC token becomes the service
#   account mito-crm-deployer only for a job of this repository (by its
#   numeric id, which a renamed or recreated repository doesn't keep), on the
#   branch dev, in the GitHub environment staging. No JSON key.
# - Staging's own image repository, mito-crm-staging: the deployer writes
#   there only, never where prod's images will be.
# - mito-crm-deployer gets roles on the staging resources only: push to that
#   repository, deploy the service mito-crm-staging and run the migrations job
#   as mito-crm-staging (actAs). No project-wide role, no access to the
#   secrets: the service account of staging reads them at runtime.
# - The migrations job mito-crm-staging-migrate, with Google's sample image:
#   the workflow gives it the image and the settings of each deploy.
# Then the values the workflow needs are printed: set them as repository
# variables (Settings > Secrets and variables > Actions > Variables).
# A second run stops at the first resource that already exists.
set -e
P=mito-crm
R=europe-west3
# The id of omardeangelis/mito-micro-services (GET /repos/omardeangelis/mito-micro-services)
REPO_ID=1268249182
REPO=omardeangelis/mito-micro-services
NUMBER=$(gcloud projects describe $P --format='value(projectNumber)')
DEPLOYER=mito-crm-deployer@$P.iam.gserviceaccount.com
RUNTIME=mito-crm-staging@$P.iam.gserviceaccount.com

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project=$P

# The identity pool of GitHub Actions. This provider accepts tokens of jobs of
# this repository on dev only; prod gets a provider of its own
gcloud iam workload-identity-pools create github --project=$P \
  --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc mito-crm-staging \
  --project=$P --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref' \
  --attribute-condition="assertion.repository_id == '$REPO_ID' && assertion.ref == 'refs/heads/dev'"

gcloud iam service-accounts create mito-crm-deployer --project=$P \
  --display-name="Deploy of mito-crm-staging from GitHub Actions"
# Only a job in the environment staging may become it: its token's subject is
# repo:<repository>:environment:staging, and the environment lets only dev in
gcloud iam service-accounts add-iam-policy-binding $DEPLOYER --project=$P \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/subject/repo:$REPO:environment:staging" \
  --condition=None >/dev/null

# Staging's images, deleted after 30 days but the last 10
gcloud artifacts repositories create mito-crm-staging --project=$P \
  --location=$R --repository-format=docker \
  --description="Images of mito-crm-staging, pushed by the deploy workflow"
cat > /tmp/mito-staging-cleanup.json <<'POLICY'
[
  {"name": "keep-last-10", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 10}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "30d"}}
]
POLICY
gcloud artifacts repositories set-cleanup-policies mito-crm-staging \
  --project=$P --location=$R --policy=/tmp/mito-staging-cleanup.json --no-dry-run
gcloud artifacts repositories add-iam-policy-binding mito-crm-staging \
  --project=$P --location=$R --member=serviceAccount:$DEPLOYER \
  --role=roles/artifactregistry.writer --condition=None >/dev/null

gcloud run services add-iam-policy-binding mito-crm-staging --project=$P \
  --region=$R --member=serviceAccount:$DEPLOYER --role=roles/run.developer \
  >/dev/null
gcloud iam service-accounts add-iam-policy-binding $RUNTIME --project=$P \
  --member=serviceAccount:$DEPLOYER --role=roles/iam.serviceAccountUser \
  --condition=None >/dev/null

# The migrations job: one task, no retry (a failed migration stops the deploy
# and waits for a person)
gcloud run jobs create mito-crm-staging-migrate --project=$P --region=$R \
  --image=us-docker.pkg.dev/cloudrun/container/job:latest \
  --service-account=$RUNTIME --tasks=1 --max-retries=0 --task-timeout=10m
gcloud run jobs add-iam-policy-binding mito-crm-staging-migrate --project=$P \
  --region=$R --member=serviceAccount:$DEPLOYER --role=roles/run.developer \
  >/dev/null

echo "Done. Repository variables for the deploy workflow:"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/mito-crm-staging"
echo "  GCP_DEPLOYER_SERVICE_ACCOUNT=$DEPLOYER"
