from __future__ import annotations

from google.cloud import firestore

CAMPAIGNS_COLLECTION = "huntr_campaigns"


def _create_firestore_client() -> firestore.Client | None:
    try:
        # Uses Application Default Credentials from the runtime environment.
        return firestore.Client()
    except Exception:
        return None


db = _create_firestore_client()
