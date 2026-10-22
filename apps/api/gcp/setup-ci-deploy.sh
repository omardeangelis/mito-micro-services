#!/bin/sh
# Lets GitHub Actions deploy mito-crm-staging, once, before the first run of
# the deploy workflow (plan: deploy/piano-pipeline-deploy.md in the project files):
#   sh apps/api/gcp/setup-ci-deploy.sh
# - Workload Identity Federation: GitHub's OIDC token of a workflow run on the
#   branch dev of omardeangelis/mito-micro-services becomes the service account
#   mito-crm-deployer. No JSON key; any other repository or branch is refused.
# - mito-crm-deployer gets roles on the staging resources only: push images
#   to the repository mito-crm, deploy the service mito-crm-staging and run the
#   migrations job as mito-crm-staging (actAs), read Cloud Run's state
#   (run.viewer, read-only, for --wait and the deploy's checks). No access to
#   the secrets: the service account of staging reads them at runtime.
# - The migrations job mito-crm-staging-migrate, with Google's sample image:
#   the workflow gives it the image and the settings of each deploy.
# Then the values the workflow needs are printed: set them as repository
# variables (Settings > Secrets and variables > Actions > Variables).
# A second run stops at the first resource that already exists.
set -e
P=mito-crm
R=europe-west3
REPO=omardeangelis/mito-micro-services
NUMBER=$(gcloud projects describe $P --format='value(projectNumber)')
DEPLOYER=mito-crm-deployer@$P.iam.gserviceaccount.com
RUNTIME=mito-crm-staging@$P.iam.gserviceaccount.com

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project=$P

# The identity pool of GitHub Actions. The provider accepts tokens of this
# repository only; repo_ref is "<repository>@<ref>", for the bindings below
gcloud iam workload-identity-pools create github --project=$P \
  --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc mito-micro-services \
  --project=$P --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repo_ref=assertion.repository + "@" + assertion.ref' \
  --attribute-condition="assertion.repository == '$REPO'"

gcloud iam service-accounts create mito-crm-deployer --project=$P \
  --display-name="Deploy of mito-crm-staging from GitHub Actions"
# Only runs on dev may become it
gcloud iam service-accounts add-iam-policy-binding $DEPLOYER --project=$P \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repo_ref/$REPO@refs/heads/dev" \
  --condition=None >/dev/null

gcloud artifacts repositories add-iam-policy-binding mito-crm --project=$P \
  --location=$R --member=serviceAccount:$DEPLOYER \
  --role=roles/artifactregistry.writer --condition=None >/dev/null
gcloud run services add-iam-policy-binding mito-crm-staging --project=$P \
  --region=$R --member=serviceAccount:$DEPLOYER --role=roles/run.developer \
  >/dev/null
gcloud iam service-accounts add-iam-policy-binding $RUNTIME --project=$P \
  --member=serviceAccount:$DEPLOYER --role=roles/iam.serviceAccountUser \
  --condition=None >/dev/null
gcloud projects add-iam-policy-binding $P --member=serviceAccount:$DEPLOYER \
  --role=roles/run.viewer --condition=None >/dev/null

# The migrations job: one task, no retry (a failed migration stops the deploy
# and waits for a person)
gcloud run jobs create mito-crm-staging-migrate --project=$P --region=$R \
  --image=us-docker.pkg.dev/cloudrun/container/job:latest \
  --service-account=$RUNTIME --tasks=1 --max-retries=0 --task-timeout=10m
gcloud run jobs add-iam-policy-binding mito-crm-staging-migrate --project=$P \
  --region=$R --member=serviceAccount:$DEPLOYER --role=roles/run.developer \
  >/dev/null

echo "Done. Repository variables for the deploy workflow:"
echo "  GCP_WORKLOAD_IDENTITY_PROVIDER=projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/mito-micro-services"
echo "  GCP_DEPLOYER_SERVICE_ACCOUNT=$DEPLOYER"
