from __future__ import annotations

from datetime import datetime
from typing import Any

from google.cloud import firestore

from db.firestore_client import CAMPAIGNS_COLLECTION, db


def _to_iso8601(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return None


def _created_at_sort_key(value: Any) -> float:
    if isinstance(value, datetime):
        return value.timestamp()

    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return 0.0

        # Firestore exports may use Z suffix while datetime.fromisoformat expects +00:00.
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"

        try:
            return datetime.fromisoformat(normalized).timestamp()
        except ValueError:
            return 0.0

    return 0.0


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
        print(f"[Firestore] Skipping save for campaign {job_id}: client unavailable")
        return

    print(f"[Firestore] Saving campaign {job_id}")

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
        print(f"[Firestore] Campaign {job_id} saved successfully")
    except Exception as exc:
        print(f"[Firestore] ERROR saving campaign {job_id}: {exc}")
        raise


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
        print("[Firestore] list_campaigns skipped: client unavailable")
        return []

    safe_limit = max(1, int(limit or 10))
    snapshots: list[Any] = []
    used_fallback_sort = False

    try:
        query = collection.order_by("created_at", direction=firestore.Query.DESCENDING).limit(
            safe_limit
        )
        snapshots = list(query.stream())
    except Exception as exc:
        print(f"[Firestore] ERROR listing campaigns with created_at ordering: {exc}")
        try:
            # Fall back to unordered reads when created_at types are mixed (string vs timestamp).
            snapshots = list(collection.limit(max(safe_limit * 5, safe_limit)).stream())
            used_fallback_sort = True
        except Exception as fallback_exc:
            print(f"[Firestore] ERROR listing campaigns: {fallback_exc}")
            return []

    campaigns_with_sort_key: list[tuple[dict[str, Any], float]] = []
    for snapshot in snapshots:
        data = snapshot.to_dict() or {}
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        leads = data.get("leads") if isinstance(data.get("leads"), list) else []
        leads_count = data.get("leads_count")
        created_at_raw = data.get("created_at")
        created_at_iso = _to_iso8601(created_at_raw)

        campaigns_with_sort_key.append(
            (
                {
                    "job_id": str(data.get("job_id") or snapshot.id),
                    "niche": str(config.get("niche", "") or data.get("niche", "")),
                    "pain_keyword": str(
                        config.get("pain_keyword", "") or data.get("pain_keyword", "")
                    ),
                    "leads_count": int(leads_count) if isinstance(leads_count, int) else len(leads),
                    "created_at": created_at_iso,
                    "status": str(data.get("status") or "unknown"),
                },
                _created_at_sort_key(created_at_raw),
            )
        )

    if used_fallback_sort:
        campaigns_with_sort_key.sort(key=lambda item: item[1], reverse=True)

    campaigns = [campaign for campaign, _ in campaigns_with_sort_key[:safe_limit]]
    print(f"[Firestore] list_campaigns returned {len(campaigns)} campaigns")
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
