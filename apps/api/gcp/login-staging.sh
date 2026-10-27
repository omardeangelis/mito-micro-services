#!/bin/sh
# The login of the mito-crm-staging backend (B6, brain/chore/migrazione-gcp.md):
# the Azure app, the SendGrid email link and better-auth's BETTER_AUTH_SECRET,
# with the same values as the Production environment of the Vercel staging
# project (brain/chore/staging-vercel.md, step 4). Vercel keeps
# BETTER_AUTH_SECRET Sensitive and doesn't show it again: it is the value saved
# there. Run it once before the first deploy that passes them, and again to
# replace a value:
#   sh apps/api/gcp/login-staging.sh
# With names as arguments it asks for those only, for example the secret added
# after the first run:
#   sh apps/api/gcp/login-staging.sh BETTER_AUTH_SECRET
# It asks for every value first, without echoing it, so they stay out of the
# shell history and the repo, and writes nothing if one is empty. Each one goes
# to the secret STAGING_<name>, readable by the service account of staging
# only. The running service doesn't change: deploy-staging.sh passes these
# secrets from the next deploy on.
set -e
P=mito-crm
R=europe-west3
SA=mito-crm-staging@$P.iam.gserviceaccount.com
ALL="AZURE_AD_CLIENT_ID AZURE_AD_CLIENT_SECRET AZURE_AD_TENANT_ID
  SENDGRID_USERNAME SENDGRID_API_KEY SENDGRID_SERVER SENDGRID_PORT
  BETTER_AUTH_SECRET"
NAMES=${*:-$ALL}
for name in $NAMES; do
  case " $(echo $ALL) " in
    *" $name "*) ;;
    *) echo "Not a login variable: $name (one of: $(echo $ALL))" >&2; exit 1 ;;
  esac
done

for name in $NAMES; do
  printf "%s of the Vercel staging project: " "$name"
  stty -echo 2>/dev/null || true
  read -r value || [ -n "$value" ]
  stty echo 2>/dev/null || true
  echo
  if [ -z "$value" ]; then
    echo "$name is empty: nothing written" >&2
    exit 1
  fi
  # better-auth refuses a shorter one (packages/server/src/betterAuth/index.ts)
  if [ "$name" = BETTER_AUTH_SECRET ] && [ ${#value} -lt 32 ]; then
    echo "$name has less than 32 characters: nothing written" >&2
    exit 1
  fi
  # The name is one of ALL (checked above); the value is only ever expanded,
  # never parsed
  eval "value_$name=\$value"
done

for name in $NAMES; do
  secret=STAGING_$name
  if ! gcloud secrets describe $secret --project=$P >/dev/null 2>&1; then
    gcloud secrets create $secret --project=$P \
      --replication-policy=user-managed --locations=$R --labels=env=staging
    gcloud secrets add-iam-policy-binding $secret --project=$P \
      --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor \
      --condition=None
  fi
  eval "printf %s \"\$value_$name\"" |
    gcloud secrets versions add $secret --project=$P --data-file=-
done
echo "Done: the next deploy-staging.sh gives the backend its login"
