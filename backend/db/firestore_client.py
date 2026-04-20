from __future__ import annotations

# Firestore setup (one-time):
# gcloud firestore databases create --location=us-central1
# gcloud projects add-iam-policy-binding notional-cirrus-458606-e0 \
#   --member="serviceAccount:1095027648976-compute@developer.gserviceaccount.com" \
#   --role="roles/datastore.user"

import os

from google.cloud import firestore

CAMPAIGNS_COLLECTION = "huntr_campaigns"


def _create_firestore_client() -> firestore.Client | None:
    try:
        # Strip accidental CRLF/whitespace from env vars so grpc metadata stays valid.
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        if project_id:
            return firestore.Client(project=project_id)

        # Uses Application Default Credentials from the runtime environment.
        return firestore.Client()
    except Exception:
        return None


db = _create_firestore_client()


def test_firestore_connection():
    if db is None:
        print("[Firestore] Connection test skipped: client unavailable")
        return False

    try:
        test_ref = db.collection("huntr_campaigns").document("test")
        test_ref.set({"test": True, "timestamp": "2026-04-19"})
        test_ref.delete()
        print("[Firestore] Connection test PASSED")
        return True
    except Exception as e:
        print(f"[Firestore] Connection test FAILED: {e}")
        import traceback

        traceback.print_exc()
        return False
