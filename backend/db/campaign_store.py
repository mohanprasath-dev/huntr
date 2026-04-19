from __future__ import annotations

from datetime import datetime
from typing import Any

from google.cloud import firestore

from db.firestore_client import CAMPAIGNS_COLLECTION, db


def _to_iso8601(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def _collection() -> firestore.CollectionReference | None:
    if db is None:
        return None
    return db.collection(CAMPAIGNS_COLLECTION)


def save_campaign(
    job_id: str,
    config: dict[str, Any],
    status: str,
    leads: list[dict[str, Any]],
    impact: dict[str, Any],
    trace: dict[str, Any],
) -> None:
    collection = _collection()
    if collection is None:
        return

    try:
        doc_ref = collection.document(job_id)
        snapshot = doc_ref.get()
        existing = snapshot.to_dict() if snapshot.exists else {}
        created_at = existing.get("created_at") if isinstance(existing, dict) else None

        doc_ref.set(
            {
                "job_id": job_id,
                "config": config,
                "status": status,
                "leads": leads,
                "impact": impact,
                "trace": trace,
                "niche": str(config.get("niche", "")),
                "pain_keyword": str(config.get("pain_keyword", "")),
                "leads_count": len(leads),
                "created_at": created_at or firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        return


def get_campaign(job_id: str) -> dict[str, Any] | None:
    collection = _collection()
    if collection is None:
        return None

    try:
        snapshot = collection.document(job_id).get()
    except Exception:
        return None

    if not snapshot.exists:
        return None

    campaign = snapshot.to_dict() or {}
    campaign.setdefault("job_id", snapshot.id)

    if "created_at" in campaign:
        campaign["created_at"] = _to_iso8601(campaign.get("created_at"))
    if "updated_at" in campaign:
        campaign["updated_at"] = _to_iso8601(campaign.get("updated_at"))

    return campaign


def list_campaigns(limit: int = 10) -> list[dict[str, Any]]:
    collection = _collection()
    if collection is None:
        return []

    safe_limit = max(1, int(limit or 10))

    try:
        query = collection.order_by("created_at", direction=firestore.Query.DESCENDING).limit(
            safe_limit
        )
        snapshots = list(query.stream())
    except Exception:
        return []

    campaigns: list[dict[str, Any]] = []
    for snapshot in snapshots:
        data = snapshot.to_dict() or {}
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        leads = data.get("leads") if isinstance(data.get("leads"), list) else []
        leads_count = data.get("leads_count")

        campaigns.append(
            {
                "job_id": str(data.get("job_id") or snapshot.id),
                "niche": str(config.get("niche", "")),
                "pain_keyword": str(config.get("pain_keyword", "")),
                "leads_count": int(leads_count) if isinstance(leads_count, int) else len(leads),
                "created_at": _to_iso8601(data.get("created_at")),
                "status": str(data.get("status") or "unknown"),
            }
        )

    return campaigns


def update_campaign_status(job_id: str, status: str) -> None:
    collection = _collection()
    if collection is None:
        return

    try:
        collection.document(job_id).set(
            {
                "status": status,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        return
