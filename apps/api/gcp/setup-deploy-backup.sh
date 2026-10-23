#!/bin/sh
# Lets the deploy of staging back up its database before migrations, once,
# after setup-ci-deploy.sh:
#   sh apps/api/gcp/setup-deploy-backup.sh
# The deployer (mito-crm-deployer) gets a role of its own, on the Cloud SQL
# instance of staging only: create a backup and read backups and the
# instance. It can't restore one, delete one or change the instance
# (RESTORE-STAGING.md is a person's job). A second run updates the role and
# adds the binding again, which changes nothing.
set -e
P=mito-crm
DEPLOYER=mito-crm-deployer@$P.iam.gserviceaccount.com
ROLE=mitoStagingBackupCreator
PERMISSIONS=cloudsql.backupRuns.create,cloudsql.backupRuns.get,cloudsql.backupRuns.list,cloudsql.instances.get

if gcloud iam roles describe $ROLE --project=$P >/dev/null 2>&1; then
  gcloud iam roles update $ROLE --project=$P --permissions=$PERMISSIONS --quiet >/dev/null
else
  gcloud iam roles create $ROLE --project=$P \
    --title="Backup of staging's database before migrations" \
    --permissions=$PERMISSIONS --stage=GA
fi
gcloud projects add-iam-policy-binding $P \
  --member=serviceAccount:$DEPLOYER --role=projects/$P/roles/$ROLE \
  --condition='expression=resource.name == "projects/mito-crm/instances/mito-crm-staging",title=staging-instance-only' \
  >/dev/null
echo "Done: $DEPLOYER can back up mito-crm-staging"
