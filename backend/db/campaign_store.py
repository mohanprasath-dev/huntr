from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any

from google.cloud import firestore as firestore_module

from db.firestore_client import CAMPAIGNS_COLLECTION, db

logger = logging.getLogger(__name__)

JOBS_COLLECTION = "huntr_jobs"

# ─── In-memory fallback store (used when Firestore is unavailable) ─────────────
_memory_jobs: dict[str, dict[str, Any]] = {}
_memory_jobs_lock = threading.Lock()
_memory_campaigns: dict[str, dict[str, Any]] = {}
_memory_campaigns_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


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


def _collection() -> firestore_module.CollectionReference | None:
    if db is None:
        return None
    return db.collection(CAMPAIGNS_COLLECTION)


def _jobs_collection() -> firestore_module.CollectionReference | None:
    if db is None:
        return None
    return db.collection(JOBS_COLLECTION)


# ─── Campaign functions ────────────────────────────────────────────────────────

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
        logger.warning("[Firestore] Skipping save for campaign %s: client unavailable — saving in-memory", job_id)
        with _memory_campaigns_lock:
            _memory_campaigns[job_id] = {
                "job_id": job_id, "config": config, "status": status, "leads": leads,
                "impact": impact, "trace": trace,
                "niche": str(config.get("niche", "")),
                "pain_keyword": str(config.get("pain_keyword", "")),
                "leads_count": len(leads),
                "created_at": _now_iso(), "updated_at": _now_iso(),
            }
        return

    logger.info("[Firestore] Saving campaign %s (%d leads)", job_id, len(leads))

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
                "created_at": created_at or firestore_module.SERVER_TIMESTAMP,
                "updated_at": firestore_module.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        logger.info("[Firestore] Campaign %s saved successfully", job_id)
    except Exception as exc:
        logger.error("[Firestore] ERROR saving campaign %s: %s", job_id, exc)
        raise


def get_campaign(job_id: str) -> dict[str, Any] | None:
    # Check in-memory first
    with _memory_campaigns_lock:
        if job_id in _memory_campaigns:
            return dict(_memory_campaigns[job_id])

    collection = _collection()
    if collection is None:
        return None

    try:
        snapshot = collection.document(job_id).get()
    except Exception as exc:
        logger.warning("[Firestore] ERROR fetching campaign %s: %s", job_id, exc)
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
        logger.warning("[Firestore] list_campaigns: client unavailable — returning in-memory campaigns")
        with _memory_campaigns_lock:
            campaigns = list(_memory_campaigns.values())
        campaigns.sort(key=lambda c: _created_at_sort_key(c.get("created_at")), reverse=True)
        return campaigns[:limit]

    safe_limit = max(1, int(limit or 10))
    snapshots: list[Any] = []
    used_fallback_sort = False

    try:
        query = collection.order_by(
            "created_at", direction=firestore_module.Query.DESCENDING
        ).limit(safe_limit)
        snapshots = list(query.stream())
    except Exception as exc:
        logger.warning("[Firestore] ERROR listing campaigns with created_at ordering: %s", exc)
        try:
            snapshots = list(collection.limit(max(safe_limit * 5, safe_limit)).stream())
            used_fallback_sort = True
        except Exception as fallback_exc:
            logger.error("[Firestore] ERROR listing campaigns: %s", fallback_exc)
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
    logger.info("[Firestore] list_campaigns returned %d campaigns", len(campaigns))
    return campaigns


def update_campaign_status(job_id: str, status: str) -> None:
    collection = _collection()

    if collection is None:
        with _memory_campaigns_lock:
            if job_id in _memory_campaigns:
                _memory_campaigns[job_id]["status"] = status
                _memory_campaigns[job_id]["updated_at"] = _now_iso()
        return

    try:
        collection.document(job_id).set(
            {
                "status": status,
                "updated_at": firestore_module.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        logger.warning("[Firestore] ERROR updating campaign status %s: %s", job_id, exc)


# ─── Job functions ─────────────────────────────────────────────────────────────

def create_job(job_id: str, config: dict[str, Any]) -> dict[str, Any]:
    job_data: dict[str, Any] = {
        "job_id": job_id,
        "status": "started",
        "config": config,
        "current_agent": "",
        "leads_found": 0,
        "leads_scored": 0,
        "steps_completed": 0,
        "stop_requested": False,
        "demo_mode": bool(config.get("demo_mode", False)),
        "started_at": _now_iso(),  # timezone-aware ISO 8601
        "completed_at": None,
        "result_leads": [],
        "impact": {},
        "events": [],
    }

    collection = _jobs_collection()
    if collection is None:
        logger.warning("[Firestore] Job store unavailable — storing job %s in-memory", job_id)
        with _memory_jobs_lock:
            _memory_jobs[job_id] = dict(job_data)
        return job_data

    try:
        collection.document(job_id).set(job_data)
        return job_data
    except Exception as exc:
        logger.error("[Firestore] ERROR creating job %s: %s — falling back to in-memory", job_id, exc)
        with _memory_jobs_lock:
            _memory_jobs[job_id] = dict(job_data)
        return job_data


def get_job(job_id: str) -> dict[str, Any] | None:
    # In-memory check first (covers both fallback and Firestore-backed jobs during active run)
    with _memory_jobs_lock:
        if job_id in _memory_jobs:
            return dict(_memory_jobs[job_id])

    collection = _jobs_collection()
    if collection is None:
        return None

    try:
        doc = collection.document(job_id).get()
        if not doc.exists:
            return None
        job = doc.to_dict() or {}
        job.setdefault("job_id", job_id)
        return job
    except Exception as exc:
        logger.warning("[Firestore] ERROR fetching job %s: %s", job_id, exc)
        return None


def update_job(job_id: str, updates: dict[str, Any]) -> None:
    # Update in-memory store if present
    with _memory_jobs_lock:
        if job_id in _memory_jobs:
            _memory_jobs[job_id].update(updates)

    collection = _jobs_collection()
    if collection is None:
        return

    try:
        collection.document(job_id).set(updates, merge=True)
    except Exception as exc:
        logger.warning("[Firestore] ERROR updating job %s: %s", job_id, exc)


def append_job_event(job_id: str, event: dict[str, Any]) -> None:
    """Append an event to the job's event list using Firestore array union."""
    # Update in-memory store if present
    with _memory_jobs_lock:
        if job_id in _memory_jobs:
            events = _memory_jobs[job_id].setdefault("events", [])
            events.append(event)

    collection = _jobs_collection()
    if collection is None:
        return

    try:
        collection.document(job_id).update({"events": firestore_module.ArrayUnion([event])})
    except Exception as exc:
        logger.warning("[Firestore] ERROR appending event for job %s: %s", job_id, exc)


def set_job_stop(job_id: str) -> None:
    updates = {
        "stop_requested": True,
        "status": "stopped",
        "current_agent": "manager",
    }
    # Update in-memory store if present
    with _memory_jobs_lock:
        if job_id in _memory_jobs:
            _memory_jobs[job_id].update(updates)

    collection = _jobs_collection()
    if collection is None:
        return

    try:
        collection.document(job_id).update(updates)
    except Exception as exc:
        logger.warning("[Firestore] ERROR stopping job %s: %s", job_id, exc)


def get_job_events(job_id: str, since_index: int = 0) -> list[dict[str, Any]]:
    job = get_job(job_id)
    if not job:
        return []

    events = job.get("events", [])
    if not isinstance(events, list):
        return []

    safe_index = max(0, int(since_index or 0))
    return [event for event in events[safe_index:] if isinstance(event, dict)]
