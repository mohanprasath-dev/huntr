from __future__ import annotations

# Firestore setup (one-time):
# gcloud firestore databases create --location=us-central1
# gcloud projects add-iam-policy-binding notional-cirrus-458606-e0 \
#   --member="serviceAccount:1095027648976-compute@developer.gserviceaccount.com" \
#   --role="roles/datastore.user"

from google.cloud import firestore

CAMPAIGNS_COLLECTION = "huntr_campaigns"


def _create_firestore_client() -> firestore.Client | None:
    try:
        # Uses Application Default Credentials from the runtime environment.
        return firestore.Client()
    except Exception:
        return None


db = _create_firestore_client()
