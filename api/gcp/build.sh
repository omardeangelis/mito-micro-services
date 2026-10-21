#!/bin/sh
# Builds the image of api/ with Cloud Build from the current commit:
#   sh api/gcp/build.sh            (from the repo root)
# The tag is the commit, so the tree must have no changes. It stops if an env
# file other than .env.example would be uploaded (.gcloudignore keeps them out)
set -e
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Commit or set aside your changes first: the tag is the commit" >&2
  exit 1
fi
# What api/Dockerfile copies: an untracked file there would go in the image too
if [ -n "$(git status --porcelain -- api src packages package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json)" ]; then
  echo "Commit or remove the untracked files in api/, src/ or packages/: the tag is the commit" >&2
  exit 1
fi
if gcloud meta list-files-for-upload . | grep -E '(^|/)\.env' | grep -vx '.env.example' >&2; then
  echo "Stopped: these env files would be uploaded" >&2
  exit 1
fi
TAG=$(git rev-parse --short HEAD)
gcloud builds submit . --project=mito-crm --region=europe-west3 \
  --config=api/gcp/cloudbuild.yaml \
  --substitutions=_IMAGE=europe-west3-docker.pkg.dev/mito-crm/mito-crm/mito-api:$TAG \
  --gcs-source-staging-dir=gs://mito-crm-build-source/source
echo "Image mito-api:$TAG. Deploy it with: sh api/gcp/deploy-staging.sh $TAG"
