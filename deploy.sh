#!/usr/bin/env bash
#
# Manual deploy helper for Daymaker Connect → Google Cloud Run.
#
# Reads NEXT_PUBLIC_* values from .env.local (or the current shell env) and
# submits them as Cloud Build substitutions. Runtime secrets must already
# exist in Secret Manager with the names cloudbuild.yaml references.
#
# Usage:
#   ./deploy.sh                 # uses defaults + .env.local
#   PROJECT_ID=my-proj ./deploy.sh
#   REGION=us-west1 ./deploy.sh
#
# Prereqs:
#   gcloud auth login && gcloud config set project <project>
#   gcloud artifacts repositories create daymaker --repository-format=docker \
#       --location=us-central1
#   Secret Manager: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
#       FIREBASE_ADMIN_PRIVATE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY,
#       STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"    # swap to us-west1 for California proximity
REPO="${REPO:-daymaker}"
SERVICE="${SERVICE:-daymaker-connect}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  echo "ERROR: PROJECT_ID is not set. Run 'gcloud config set project <id>' or export PROJECT_ID." >&2
  exit 1
fi

# Load NEXT_PUBLIC_* from .env.local if present. They are public keys but
# still need to be in scope here so cloudbuild.yaml can bake them into the
# client bundle at build time. Server secrets live in Secret Manager — don't
# read them here.
if [[ -f .env.local ]]; then
  echo "Loading NEXT_PUBLIC_* from .env.local"
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

# Validate build-time envs are present.
required=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
)
missing=()
for var in "${required[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: missing required env vars: ${missing[*]}" >&2
  echo "Set them in .env.local or export them in the shell." >&2
  exit 1
fi

# Default NEXT_PUBLIC_APP_URL to the Cloud Run service URL pattern if unset
# OR if it was sourced from .env.local pointing at localhost (dev value leaks
# into prod build otherwise). The PROJECT_ID-scoped URL is an approximation —
# Cloud Run actually issues a hash-based URL. Override in shell if you know
# the real one, e.g. NEXT_PUBLIC_APP_URL=https://… ./deploy.sh
if [[ -z "${NEXT_PUBLIC_APP_URL:-}" || "${NEXT_PUBLIC_APP_URL}" == http://localhost* ]]; then
  NEXT_PUBLIC_APP_URL="https://${SERVICE}-${PROJECT_ID}.${REGION}.run.app"
fi

echo "---"
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Repo:     ${REPO}"
echo "Service:  ${SERVICE}"
echo "App URL:  ${NEXT_PUBLIC_APP_URL}"
echo "---"

# Cloud Build substitutions can't contain commas in values. We join via a
# delimiter (^@^) so URL-safe values pass through cleanly.
SUBS=$(cat <<EOF | paste -sd ',' -
_REGION=${REGION}
_REPO=${REPO}
_SERVICE=${SERVICE}
_NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
_NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
_NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
_NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
EOF
)

echo "Submitting Cloud Build…"
gcloud builds submit . \
  --project="${PROJECT_ID}" \
  --config=cloudbuild.yaml \
  --substitutions="${SUBS}"

echo
echo "Deploy complete."
gcloud run services describe "${SERVICE}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)'
