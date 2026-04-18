#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="notional-cirrus-458606-e0"
REGION="us-central1"
AR_REPO="huntr"

# Override this if your Cloud Run service uses a custom service account.
# Example:
#   CLOUD_RUN_SA="my-sa@${PROJECT_ID}.iam.gserviceaccount.com" ./backend/setup_gcp.sh
CLOUD_RUN_SA="${CLOUD_RUN_SA:-}"

SECRETS=(
  "SERPER_API_KEY"
  "TAVILY_API_KEY"
  "BREVO_SMTP_KEY"
  "PROXYCURL_API_KEY"
)

step() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

step "Step 1: Set project and enable required APIs"
gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project "${PROJECT_ID}"

echo "Enabled APIs: run, aiplatform, artifactregistry, cloudbuild, secretmanager"

step "Step 2: Create Artifact Registry repository '${AR_REPO}' in ${REGION}"
if gcloud artifacts repositories describe "${AR_REPO}" \
  --location "${REGION}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Artifact Registry repo already exists: ${AR_REPO}"
else
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Huntr container images" \
    --project="${PROJECT_ID}"
  echo "Created Artifact Registry repo: ${AR_REPO}"
fi

step "Step 3: Create required Secret Manager secrets"
for secret in "${SECRETS[@]}"; do
  if gcloud secrets describe "${secret}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    echo "Secret already exists: ${secret}"
  else
    gcloud secrets create "${secret}" \
      --replication-policy="automatic" \
      --project="${PROJECT_ID}"
    echo "Created secret: ${secret}"
  fi
done

step "Step 4: Resolve Cloud Run service account"
if [[ -z "${CLOUD_RUN_SA}" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
echo "Using Cloud Run service account: ${CLOUD_RUN_SA}"

step "Step 5: Grant Cloud Run SA access to secrets and Vertex AI"
for secret in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}" >/dev/null
  echo "Granted roles/secretmanager.secretAccessor on ${secret}"
done

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUD_RUN_SA}" \
  --role="roles/aiplatform.user" >/dev/null
echo "Granted roles/aiplatform.user on project ${PROJECT_ID}"

echo
echo "GCP setup complete for project ${PROJECT_ID}."
echo "If needed, add secret values with:"
echo "  printf '%s' 'your-value' | gcloud secrets versions add SECRET_NAME --data-file=- --project ${PROJECT_ID}"
