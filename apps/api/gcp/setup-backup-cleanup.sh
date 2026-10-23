#!/bin/sh
# Lets the weekly cleanup of staging's deploy backups run, once, after
# setup-deploy-backup.sh:
#   sh apps/api/gcp/setup-backup-cleanup.sh
# - Its own service account, mito-crm-backup-cleaner: the deployer can create
#   backups but never delete them, the cleaner can only list and delete them,
#   on the Cloud SQL instance of staging only.
# - Workload Identity Federation: only a job of the workflow
#   cleanup-staging-backups.yaml on dev may become it. The provider of
#   staging (setup-ci-deploy.sh) gets the attribute job_workflow_ref for it;
#   its condition, this repository on dev, stays the same. No GitHub
#   environment and no JSON key.
# A second run updates the role and the mapping and adds the bindings again,
# which changes nothing.
set -e
P=mito-crm
REPO=omardeangelis/mito-micro-services
NUMBER=$(gcloud projects describe $P --format='value(projectNumber)')
CLEANER=mito-crm-backup-cleaner@$P.iam.gserviceaccount.com
ROLE=mitoStagingBackupCleaner
PERMISSIONS=cloudsql.backupRuns.delete,cloudsql.backupRuns.get,cloudsql.backupRuns.list,cloudsql.instances.get
WORKFLOW=$REPO/.github/workflows/cleanup-staging-backups.yaml@refs/heads/dev

gcloud iam workload-identity-pools providers update-oidc mito-crm-staging \
  --project=$P --location=global --workload-identity-pool=github \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.job_workflow_ref=assertion.job_workflow_ref' \
  >/dev/null

if ! gcloud iam service-accounts describe $CLEANER --project=$P >/dev/null 2>&1; then
  gcloud iam service-accounts create mito-crm-backup-cleaner --project=$P \
    --display-name="Weekly cleanup of staging's deploy backups"
fi
if gcloud iam roles describe $ROLE --project=$P >/dev/null 2>&1; then
  gcloud iam roles update $ROLE --project=$P --permissions=$PERMISSIONS --quiet >/dev/null
else
  gcloud iam roles create $ROLE --project=$P \
    --title="Delete staging's deploy backups" \
    --permissions=$PERMISSIONS --stage=GA
fi
gcloud projects add-iam-policy-binding $P \
  --member=serviceAccount:$CLEANER --role=projects/$P/roles/$ROLE \
  --condition='expression=resource.name == "projects/mito-crm/instances/mito-crm-staging",title=staging-instance-only' \
  >/dev/null
gcloud iam service-accounts add-iam-policy-binding $CLEANER --project=$P \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.job_workflow_ref/$WORKFLOW" \
  --condition=None >/dev/null
echo "Done: cleanup-staging-backups.yaml on dev runs as $CLEANER"
