from __future__ import annotations

import asyncio
import base64
import csv
import json
import io
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from agents.manager import HuntRManager
from db.campaign_store import (
    append_job_event,
    create_job,
    get_campaign,
    get_job,
    get_job_events,
    list_campaigns,
    save_campaign,
    set_job_stop,
    update_job,
)
from db.firestore_client import CAMPAIGNS_COLLECTION, db, test_firestore_connection
from tools.email_tool import BrevoEmailTool

load_dotenv()
test_firestore_connection()

app = FastAPI(title="HuntR API", version="0.1.0")
email_tool = BrevoEmailTool()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://huntr-lovat.vercel.app",
        "https://huntr.mohanprasath.dev",
        "http://huntr.mohanprasath.dev",
        "https://www.mohanprasath.dev",
        "https://mohanprasath.dev",
    ],
    allow_origin_regex=r"https?://([a-zA-Z0-9-]+\.)*mohanprasath\.dev",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tracking_store: dict[str, dict[str, Any]] = {}
tracking_store_lock = threading.Lock()
TERMINAL_STATUSES = {"completed", "failed", "stopped"}
TIME_SAVED_MINUTES_BASELINE = 180
MANUAL_COST_PER_QUALIFIED_LEAD_INR = 840
VS_MANUAL_SUMMARY = (
    "This would take a human 3+ hours of LinkedIn browsing, company research, and writing"
)
TRACKING_GIF_BYTES = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)
TRACKING_PIXEL_BASE_URL = (
    "https://huntr-backend-1095027648976.us-central1.run.app"
)
LEADS_CSV_COLUMNS = [
    "company",
    "score",
    "source_url",
    "decision_maker",
    "decision_maker_source",
    "pain_point",
    "email",
    "email_source",
    "email_subject",
    "email_body",
    "linkedin_message",
    "source",
    "day3_followup",
    "day7_followup",
    "day14_followup",
]


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _pipeline_duration_seconds(job: dict[str, Any]) -> int:
    stored_duration = _to_int(job.get("pipeline_duration_seconds"))
    if stored_duration is not None and stored_duration >= 0:
        return stored_duration

    started_epoch = job.get("started_at_epoch")
    completed_epoch = job.get("completed_at_epoch")
    if isinstance(started_epoch, (int, float)) and isinstance(completed_epoch, (int, float)):
        return max(0, int(completed_epoch - started_epoch))

    started_at_raw = str(job.get("started_at") or "").strip()
    completed_at_raw = str(job.get("completed_at") or "").strip()
    if started_at_raw and completed_at_raw:
        started_at_value = started_at_raw.replace("Z", "+00:00")
        completed_at_value = completed_at_raw.replace("Z", "+00:00")
        try:
            started_at = datetime.fromisoformat(started_at_value)
            completed_at = datetime.fromisoformat(completed_at_value)
            return max(0, int((completed_at - started_at).total_seconds()))
        except ValueError:
            return 0

    return 0


def _build_impact(job: dict[str, Any], leads_qualified: int) -> dict[str, Any]:
    leads_found = int(job.get("leads_found", 0) or 0)
    return {
        "time_saved_minutes": TIME_SAVED_MINUTES_BASELINE,
        "leads_found": leads_found,
        "leads_qualified": leads_qualified,
        "emails_personalized": leads_qualified,
        "manual_cost_inr": leads_qualified * MANUAL_COST_PER_QUALIFIED_LEAD_INR,
        "pipeline_duration_seconds": _pipeline_duration_seconds(job),
        "vs_manual": VS_MANUAL_SUMMARY,
    }


def _impact_with_defaults(
    job: dict[str, Any],
    leads_qualified: int,
    candidate: Any,
) -> dict[str, Any]:
    impact = _build_impact(job=job, leads_qualified=leads_qualified)
    if isinstance(candidate, dict):
        for key in impact:
            value = candidate.get(key)
            if value is not None:
                impact[key] = value
    return impact


def _build_campaign_from_job(job_id: str, job: dict[str, Any]) -> dict[str, Any]:
    config = dict(job.get("config", {}))
    leads = list(job.get("result_leads") or job.get("leads") or [])

    return {
        "job_id": job_id,
        "config": config,
        "status": str(job.get("status", "unknown")),
        "leads": leads,
        "impact": _build_impact(job=job, leads_qualified=len(leads)),
        "trace": {
            "events": list(job.get("events", [])),
            "path": str(job.get("trace_path", "")),
        },
        "niche": str(config.get("niche", "")),
        "pain_keyword": str(config.get("pain_keyword", "")),
        "leads_count": len(leads),
        "created_at": str(job.get("created_at", "")),
    }


def _read_trace_events(trace_path: Path) -> list[dict[str, Any]]:
    if not trace_path.exists():
        return []

    try:
        raw = json.loads(trace_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return []


def _job_leads(job: dict[str, Any]) -> list[dict[str, Any]]:
    leads = job.get("result_leads")
    if not isinstance(leads, list):
        leads = job.get("leads")
    if not isinstance(leads, list):
        return []
    return [lead for lead in leads if isinstance(lead, dict)]


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _lead_followup_for_day(followup_sequence: Any, day: int) -> str:
    if not isinstance(followup_sequence, list):
        return ""

    for item in followup_sequence:
        if not isinstance(item, dict):
            continue
        if _to_int(item.get("day")) == day:
            return _text(item.get("message") or item.get("body") or item.get("text"))

    return ""


def _lead_csv_row(lead: dict[str, Any]) -> dict[str, str]:
    email_draft = lead.get("email_draft") if isinstance(lead.get("email_draft"), dict) else {}
    followup_sequence = lead.get("followup_sequence")

    return {
        "company": _text(lead.get("company") or lead.get("company_name")),
        "score": _text(lead.get("score")),
        "source_url": _text(lead.get("source_url") or lead.get("website") or lead.get("url")),
        "decision_maker": _text(lead.get("decision_maker")),
        "decision_maker_source": _text(
            lead.get("decision_maker_source") or lead.get("linkedin_url")
        ),
        "pain_point": _text(lead.get("pain_point") or lead.get("pain_signal")),
        "email": _text(lead.get("email") or lead.get("email_hint")),
        "email_source": _text(lead.get("email_source")),
        "email_subject": _text(lead.get("email_subject") or email_draft.get("subject")),
        "email_body": _text(lead.get("email_body") or email_draft.get("body")),
        "linkedin_message": _text(lead.get("linkedin_message") or lead.get("linkedin_draft")),
        "source": _text(lead.get("source")),
        "day3_followup": _text(
            lead.get("day3_followup") or _lead_followup_for_day(followup_sequence, 3)
        ),
        "day7_followup": _text(
            lead.get("day7_followup") or _lead_followup_for_day(followup_sequence, 7)
        ),
        "day14_followup": _text(
            lead.get("day14_followup") or _lead_followup_for_day(followup_sequence, 14)
        ),
    }


def _render_leads_csv(leads: list[dict[str, Any]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=LEADS_CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()

    for lead in leads:
        if isinstance(lead, dict):
            writer.writerow(_lead_csv_row(lead))

    return output.getvalue()


def _get_leads_from_store(job_id: str) -> list[dict[str, Any]]:
    campaign = get_campaign(job_id)
    if campaign is not None:
        campaign_leads = campaign.get("leads")
        if isinstance(campaign_leads, list):
            return [lead for lead in campaign_leads if isinstance(lead, dict)]

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

    return _job_leads(job)


def _build_result_summary(agent: str, action: str, payload: Any) -> str:
    if not isinstance(payload, dict) or not payload:
        return f"{agent} {action}"

    explicit_summary = str(payload.get("result_summary") or "").strip()
    if explicit_summary:
        return explicit_summary

    if agent == "scout":
        found = _to_int(payload.get("found"))
        total_unique = _to_int(payload.get("total_unique"))
        if found is not None and total_unique is not None:
            return f"Found {found} leads ({total_unique} unique so far)."

    if agent == "researcher":
        company = str(payload.get("company") or "lead").strip()
        return f"Enriched {company}."

    if agent == "scorer" and action == "pass":
        qualified = _to_int(payload.get("qualified"))
        scored = _to_int(payload.get("scored"))
        threshold = _to_int(payload.get("threshold"))
        if qualified is not None and scored is not None and threshold is not None:
            return f"Qualified {qualified}/{scored} leads at threshold {threshold}."

    if agent == "manager" and action == "complete":
        returned = _to_int(payload.get("returned_leads"))
        if returned is not None:
            return f"Run completed with {returned} leads."

    encoded = json.dumps(payload, ensure_ascii=True)
    if len(encoded) > 180:
        return f"{encoded[:177]}..."
    return encoded


def _record_step(
    job_id: str,
    agent: str,
    action: str,
    result_summary: str,
    timestamp: str,
    payload: dict[str, Any] | None = None,
) -> None:
    job = get_job(job_id)
    if not job:
        return

    safe_payload = payload or {}
    updates: dict[str, Any] = {"current_agent": agent}

    if agent == "scout":
        total_unique = _to_int(safe_payload.get("total_unique"))
        found = _to_int(safe_payload.get("found"))
        existing_found = int(job.get("leads_found", 0) or 0)
        if total_unique is not None:
            updates["leads_found"] = max(existing_found, total_unique)
        elif found is not None:
            updates["leads_found"] = max(existing_found, found)

    if agent == "scorer":
        scored = _to_int(safe_payload.get("scored"))
        lead_index = _to_int(safe_payload.get("lead_index"))
        existing_scored = int(job.get("leads_scored", 0) or 0)
        if scored is not None:
            updates["leads_scored"] = max(existing_scored, scored)
        elif lead_index is not None and action == "score":
            updates["leads_scored"] = max(existing_scored, lead_index)

    current_steps = int(job.get("steps_completed", 0) or 0)
    updates["steps_completed"] = current_steps + 1
    update_job(job_id, updates)

    event = {
        "agent": agent,
        "action": action,
        "result_summary": result_summary,
        "timestamp": timestamp,
    }
    append_job_event(job_id, event)


def _ingest_trace_events(job_id: str, trace_path: Path, cursor: int) -> int:
    events = _read_trace_events(trace_path)
    if cursor >= len(events):
        return cursor

    for event in events[cursor:]:
        step = str(event.get("step") or "manager:update").strip()
        if ":" in step:
            agent, action = step.split(":", 1)
        else:
            agent, action = "manager", step

        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        timestamp = str(event.get("timestamp") or _now_iso())
        summary = _build_result_summary(agent=agent, action=action, payload=payload)
        _record_step(
            job_id=job_id,
            agent=agent,
            action=action,
            result_summary=summary,
            timestamp=timestamp,
            payload=payload,
        )

    return len(events)


def _format_leads(leads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    formatted: list[dict[str, Any]] = []
    for lead in leads:
        formatted.append(
            {
                "company": lead.get("company_name") or lead.get("company") or "Unknown",
                "score": int(lead.get("score", 0) or 0),
                "decision_maker": lead.get("decision_maker") or "Unknown",
                "source_url": lead.get("source_url") or lead.get("website") or lead.get("url"),
                "decision_maker_source": lead.get("decision_maker_source")
                or lead.get("linkedin_url"),
                "email": lead.get("email"),
                "email_source": lead.get("email_source"),
                "pain_point": lead.get("pain_point") or lead.get("pain_signal"),
                "source": lead.get("source") or "unknown",
                "email_draft": {
                    "subject": lead.get("email_subject") or "",
                    "body": lead.get("email_body") or "",
                },
                "linkedin_draft": lead.get("linkedin_message") or "",
                "followup_sequence": lead.get("followup_sequence") or [],
            }
        )
    return formatted


def _run_hunt_job(job_id: str, config: dict[str, Any]) -> None:
    trace_path = Path(__file__).resolve().parent / "logs" / f"trace_{job_id}.json"

    if not get_job(job_id):
        return

    update_job(
        job_id,
        {
            "status": "running",
            "current_agent": "manager",
            "trace_path": str(trace_path),
        },
    )

    try:
        manager = HuntRManager(trace_path=trace_path)
    except Exception as exc:  # pragma: no cover - environment/bootstrap sensitive path
        update_job(
            job_id,
            {
                "status": "failed",
                "current_agent": "manager",
                "error": str(exc),
            },
        )
        _record_step(
            job_id=job_id,
            agent="manager",
            action="failed",
            result_summary="Pipeline failed during manager initialization.",
            timestamp=_now_iso(),
            payload={},
        )
        return

    result_box: dict[str, Any] = {"leads": []}
    error_box: dict[str, str] = {}

    def _invoke_run_huntr() -> None:
        try:
            result_box["leads"] = manager.run_huntr(config=config, max_leads=20, job_id=job_id)
        except Exception as exc:  # pragma: no cover - network/credentials sensitive path
            error_box["error"] = str(exc)

    worker = threading.Thread(target=_invoke_run_huntr, daemon=True)
    worker.start()

    cursor = 0
    while worker.is_alive():
        cursor = _ingest_trace_events(job_id=job_id, trace_path=trace_path, cursor=cursor)
        time.sleep(0.25)

    worker.join()
    cursor = _ingest_trace_events(job_id=job_id, trace_path=trace_path, cursor=cursor)

    if error_box:
        final_status = "failed"
        job = get_job(job_id)
        if job and (
            str(job.get("status", "")).lower() == "stopped"
            or bool(job.get("stop_requested", False))
        ):
            final_status = "stopped"

        update_job(
            job_id,
            {
                "status": final_status,
                "current_agent": "manager",
                "error": error_box["error"],
                "completed_at": _now_iso(),
            },
        )

        if final_status == "stopped":
            _record_step(
                job_id=job_id,
                agent="manager",
                action="stopped",
                result_summary="Job stopped before pipeline completion.",
                timestamp=_now_iso(),
                payload={},
            )
        else:
            _record_step(
                job_id=job_id,
                agent="manager",
                action="failed",
                result_summary="Pipeline failed. Check error details.",
                timestamp=_now_iso(),
                payload={},
            )
        return

    raw_leads = result_box.get("leads") or []
    formatted = _format_leads(raw_leads)
    completed_at_iso = _now_iso()
    completed_at_epoch = time.time()
    final_status = "completed"

    job = get_job(job_id)
    if not job:
        return

    if str(job.get("status", "")).lower() == "stopped" or bool(job.get("stop_requested", False)):
        final_status = "stopped"

    started_at_epoch = job.get("started_at_epoch")
    if isinstance(started_at_epoch, (int, float)):
        pipeline_duration_seconds = max(0, int(completed_at_epoch - started_at_epoch))
    else:
        pipeline_duration_seconds = 0

    updates: dict[str, Any] = {
        "status": final_status,
        "current_agent": "manager",
        "raw_leads": raw_leads,
        "result_leads": formatted,
        "leads": formatted,
        "completed_at": completed_at_iso,
        "completed_at_epoch": completed_at_epoch,
        "pipeline_duration_seconds": pipeline_duration_seconds,
    }

    if int(job.get("leads_found", 0) or 0) == 0:
        updates["leads_found"] = len(raw_leads)
    if int(job.get("leads_scored", 0) or 0) == 0:
        updates["leads_scored"] = len(raw_leads)

    job_for_impact = dict(job)
    job_for_impact.update(updates)
    updates["impact"] = _build_impact(job=job_for_impact, leads_qualified=len(formatted))
    update_job(job_id, updates)

    if final_status == "stopped":
        _record_step(
            job_id=job_id,
            agent="manager",
            action="stopped",
            result_summary=f"Job stopped. {len(formatted)} partial leads available.",
            timestamp=_now_iso(),
            payload={},
        )
    else:
        _record_step(
            job_id=job_id,
            agent="manager",
            action="ready",
            result_summary=f"Job complete. {len(formatted)} leads ready.",
            timestamp=_now_iso(),
            payload={},
        )

    completed_job = get_job(job_id)
    job_snapshot = dict(completed_job) if completed_job is not None else None

    if job_snapshot is not None:
        campaign = _build_campaign_from_job(job_id=job_id, job=job_snapshot)
        config = dict(campaign.get("config") or {})
        leads = list(campaign.get("leads") or [])
        impact = dict(campaign.get("impact") or {})
        trace = dict(campaign.get("trace") or {})
        trace["raw_trace_events"] = _read_trace_events(trace_path)

        print(f"[API] Pipeline completed for job {job_id}")
        print(f"[API] Leads count: {len(leads)}")
        print(f"[API] Attempting Firestore save...")

        try:
            save_campaign(
                job_id=job_id,
                config=config,
                status=str(campaign.get("status") or final_status),
                leads=leads,
                impact=impact,
                trace=trace,
            )
            print(f"[API] Firestore save SUCCESS for job {job_id}")
        except Exception as e:
            print(f"[API] Firestore save FAILED: {e}")
            import traceback

            traceback.print_exc()


class HuntRequest(BaseModel):
    niche: str = Field(..., min_length=2)
    pain_keyword: str = Field(..., min_length=2)
    sender_name: str = Field(..., min_length=1)
    sender_company: str = Field(..., min_length=1)
    sender_service: str = Field(..., min_length=1)


class DemoSelfCorrectRequest(BaseModel):
    sender_name: str = Field(..., min_length=1)
    sender_company: str = Field(..., min_length=1)
    sender_service: str = Field(..., min_length=1)


class HuntStartResponse(BaseModel):
    job_id: str
    status: str


class HuntStopResponse(BaseModel):
    job_id: str
    status: str


class DemoSelfCorrectResponse(BaseModel):
    job_id: str
    status: str
    demo_mode: bool


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    current_agent: str
    leads_found: int
    leads_scored: int
    steps_completed: int


class JobLeadsResponse(BaseModel):
    class Impact(BaseModel):
        time_saved_minutes: int
        leads_found: int
        leads_qualified: int
        emails_personalized: int
        manual_cost_inr: int
        pipeline_duration_seconds: int
        vs_manual: str

    job_id: str
    leads: list[dict[str, Any]]
    impact: Impact


class SendLeadRequest(BaseModel):
    approved: bool = Field(default=False)
    to_email: str = Field(default="")
    from_name: str = Field(default="")
    from_email: str = Field(default="")


class SendLeadResponse(BaseModel):
    job_id: str
    lead_id: int
    status: str
    provider: str
    recipient: str
    tracking_id: str | None = None
    delivery_status: str | None = None
    detail: str | None = None


class GlobalStatsResponse(BaseModel):
    total_leads_all_time: int
    total_emails_sent: int
    active_jobs: int


class FeedbackRequest(BaseModel):
    page: str = Field(..., min_length=1)
    rating: int = Field(..., ge=1, le=5)
    feedback: str = Field(..., min_length=1)
    email: str = Field(default="")


class FeedbackResponse(BaseModel):
    status: str


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "huntr-backend",
        "project": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
        "location": os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
    }


@app.get("/stats/global", response_model=GlobalStatsResponse)
def get_global_stats() -> GlobalStatsResponse:
    total_leads_all_time = 0
    active_jobs = 0

    try:
        if db is not None:
            snapshots = db.collection(CAMPAIGNS_COLLECTION).stream()
            for snapshot in snapshots:
                campaign = snapshot.to_dict() or {}
                leads_found_raw = campaign.get("leads_found")
                if leads_found_raw is None:
                    impact = campaign.get("impact") if isinstance(campaign.get("impact"), dict) else {}
                    leads_found_raw = impact.get("leads_found")

                leads_found = _to_int(leads_found_raw)
                if leads_found is not None:
                    total_leads_all_time += max(0, leads_found)
    except Exception:
        total_leads_all_time = 0

    with tracking_store_lock:
        total_emails_sent = len(tracking_store)

    try:
        if db is not None:
            active_snapshots = db.collection("huntr_jobs").where("status", "==", "running").stream()
            active_jobs = sum(1 for _ in active_snapshots)
    except Exception:
        active_jobs = 0

    return GlobalStatsResponse(
        total_leads_all_time=total_leads_all_time,
        total_emails_sent=total_emails_sent,
        active_jobs=active_jobs,
    )


@app.post("/feedback", response_model=FeedbackResponse)
def submit_feedback(body: FeedbackRequest) -> FeedbackResponse:
    apps_script_url = os.getenv("APPS_SCRIPT_URL", "").strip()
    if not apps_script_url:
        raise HTTPException(status_code=500, detail="APPS_SCRIPT_URL is not configured.")

    try:
        response = requests.post(
            apps_script_url,
            data={
                "page": body.page,
                "rating": str(body.rating),
                "feedback": body.feedback,
                "email": body.email,
            },
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=500, detail=f"Feedback proxy failed: {exc}") from exc

    return FeedbackResponse(status="success")


@app.post("/hunt", response_model=HuntStartResponse)
def run_hunt(request: HuntRequest) -> HuntStartResponse:
    job_id = str(uuid4())
    started_at_epoch = time.time()
    config = {
        "niche": request.niche.strip(),
        "pain_keyword": request.pain_keyword.strip(),
        "sender_name": request.sender_name.strip(),
        "sender_company": request.sender_company.strip(),
        "sender_service": request.sender_service.strip(),
    }

    job = create_job(job_id, config)
    if not job:
        raise HTTPException(status_code=503, detail="Job store is unavailable.")

    # Keep an epoch timestamp for duration math without repeated ISO parsing.
    update_job(job_id, {"started_at_epoch": started_at_epoch})

    worker = threading.Thread(target=_run_hunt_job, args=(job_id, config), daemon=True)
    worker.start()
    return HuntStartResponse(job_id=job_id, status="started")


@app.post("/hunt/{job_id}/stop", response_model=HuntStopResponse)
def stop_hunt(job_id: str) -> HuntStopResponse:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

    status = str(job.get("status", "unknown")).lower()
    if status not in {"started", "running"}:
        raise HTTPException(status_code=404, detail=f"Job {job_id} is not running.")

    set_job_stop(job_id)

    return HuntStopResponse(job_id=job_id, status="stopped")


@app.post("/demo/self-correct", response_model=DemoSelfCorrectResponse)
def run_demo_self_correct(request: DemoSelfCorrectRequest) -> DemoSelfCorrectResponse:
    job_id = str(uuid4())
    started_at_epoch = time.time()
    config: dict[str, Any] = {
        "niche": "SaaS B2B India",
        "pain_keyword": "manual outbound sales",
        "sender_name": request.sender_name.strip(),
        "sender_company": request.sender_company.strip(),
        "sender_service": request.sender_service.strip(),
        "demo_mode": True,
    }

    job = create_job(job_id, config)
    if not job:
        raise HTTPException(status_code=503, detail="Job store is unavailable.")

    update_job(job_id, {"started_at_epoch": started_at_epoch, "demo_mode": True})

    worker = threading.Thread(target=_run_hunt_job, args=(job_id, config), daemon=True)
    worker.start()
    return DemoSelfCorrectResponse(job_id=job_id, status="started", demo_mode=True)


@app.get("/status/{job_id}", response_model=JobStatusResponse)
def get_status(job_id: str) -> JobStatusResponse:
    job = get_job(job_id)
    if not job:
        campaign = get_campaign(job_id)
        if campaign is None:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

        impact = campaign.get("impact") if isinstance(campaign.get("impact"), dict) else {}
        leads = campaign.get("leads") if isinstance(campaign.get("leads"), list) else []
        trace = campaign.get("trace") if isinstance(campaign.get("trace"), dict) else {}
        trace_events = trace.get("events") if isinstance(trace.get("events"), list) else []

        leads_found = _to_int(campaign.get("leads_found"))
        if leads_found is None:
            leads_found = _to_int(impact.get("leads_found"))
        if leads_found is None:
            leads_found = len(leads)

        leads_scored = _to_int(campaign.get("leads_scored"))
        if leads_scored is None:
            leads_scored = leads_found

        return JobStatusResponse(
            job_id=job_id,
            status=str(campaign.get("status", "completed")),
            current_agent="manager",
            leads_found=max(0, int(leads_found)),
            leads_scored=max(0, int(leads_scored)),
            steps_completed=len(trace_events),
        )

    return JobStatusResponse(
        job_id=job_id,
        status=str(job.get("status", "unknown")),
        current_agent=str(job.get("current_agent", "manager")),
        leads_found=int(job.get("leads_found", 0)),
        leads_scored=int(job.get("leads_scored", 0)),
        steps_completed=int(job.get("steps_completed", 0)),
    )


@app.get("/leads/{job_id}", response_model=JobLeadsResponse)
def get_leads(job_id: str) -> JobLeadsResponse:
    job = get_job(job_id)
    if not job:
        campaign = get_campaign(job_id)
        if campaign is None:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

        campaign_leads = campaign.get("leads")
        leads = [lead for lead in campaign_leads if isinstance(lead, dict)] if isinstance(campaign_leads, list) else []
        fallback_job = {
            "leads_found": len(leads),
            "pipeline_duration_seconds": _to_int(
                (campaign.get("impact") or {}).get("pipeline_duration_seconds")
                if isinstance(campaign.get("impact"), dict)
                else 0
            )
            or 0,
        }
        impact = _impact_with_defaults(
            job=fallback_job,
            leads_qualified=len(leads),
            candidate=campaign.get("impact"),
        )

        return JobLeadsResponse(
            job_id=job_id,
            leads=leads,
            impact=JobLeadsResponse.Impact(**impact),
        )

    leads = _job_leads(job)
    leads_qualified = len(leads)
    impact = _impact_with_defaults(
        job=job,
        leads_qualified=leads_qualified,
        candidate=job.get("impact"),
    )

    return JobLeadsResponse(
        job_id=job_id,
        leads=leads,
        impact=JobLeadsResponse.Impact(**impact),
    )


@app.get("/leads/{job_id}/export/csv")
def export_leads_csv(job_id: str) -> StreamingResponse:
    leads = _get_leads_from_store(job_id)
    csv_payload = _render_leads_csv(leads).encode("utf-8")

    return StreamingResponse(
        iter([csv_payload]),
        media_type="text/csv",
        headers={
            "Content-Type": "text/csv",
            "Content-Disposition": f'attachment; filename="huntr_{job_id[:8]}_leads.csv"',
        },
    )


@app.get("/campaigns")
def get_campaign_history(limit: int = 10) -> list[dict[str, Any]]:
    return list_campaigns(limit=limit)


@app.get("/campaigns/{job_id}")
def get_campaign_by_job_id(job_id: str) -> dict[str, Any]:
    campaign = get_campaign(job_id)
    if campaign is not None:
        return campaign

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
    job_snapshot = dict(job)

    return _build_campaign_from_job(job_id=job_id, job=job_snapshot)


@app.get("/stream/{job_id}")
async def stream_job(job_id: str) -> StreamingResponse:
    async def _event_generator() -> Any:
        last_index = 0
        last_ping = time.time()

        while True:
            if time.time() - last_ping > 15:
                yield ": keepalive\n\n"
                last_ping = time.time()

            events = get_job_events(job_id, last_index)
            if events:
                for event in events:
                    yield f"data: {json.dumps(event, ensure_ascii=True)}\n\n"
                last_index += len(events)

            job = get_job(job_id)
            if job is None:
                campaign = get_campaign(job_id)
                if campaign is None:
                    yield (
                        "data: "
                        f"{json.dumps({'agent': 'system', 'action': 'error', 'result_summary': 'Job not found', 'timestamp': _now_iso()}, ensure_ascii=True)}"
                        "\n\n"
                    )
                    break
                status = str(campaign.get("status", "unknown")).lower()
            else:
                status = str(job.get("status", "unknown")).lower()

            if status in TERMINAL_STATUSES:
                terminal_event = {
                    "agent": "system",
                    "action": "stream_closed",
                    "result_summary": "Stream closed",
                    "status": status,
                    "timestamp": _now_iso(),
                }
                yield f"data: {json.dumps(terminal_event, ensure_ascii=True)}\n\n"
                break

            await asyncio.sleep(1)

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.post("/send/{job_id}/{lead_id}", response_model=SendLeadResponse)
def send_for_lead(job_id: str, lead_id: int, request: SendLeadRequest) -> SendLeadResponse:
    job = get_job(job_id)
    campaign = None

    if job is None:
        campaign = get_campaign(job_id)
        if campaign is None:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

    status = str((job or campaign or {}).get("status") or "unknown").lower()
    if status != "completed":
        raise HTTPException(status_code=409, detail="Job is not completed yet.")

    if job is not None:
        raw_leads_candidate = job.get("raw_leads")
        if isinstance(raw_leads_candidate, list):
            raw_leads = [lead for lead in raw_leads_candidate if isinstance(lead, dict)]
        else:
            raw_leads = _job_leads(job)
    else:
        campaign_leads = campaign.get("leads") if isinstance(campaign, dict) else None
        raw_leads = [lead for lead in campaign_leads if isinstance(lead, dict)] if isinstance(campaign_leads, list) else []

    if lead_id < 0 or lead_id >= len(raw_leads):
        raise HTTPException(status_code=404, detail=f"Invalid lead_id: {lead_id}")

    lead = raw_leads[lead_id]

    if not request.approved:
        return SendLeadResponse(
            job_id=job_id,
            lead_id=lead_id,
            status="awaiting_approval",
            provider="brevo-smtp",
            recipient=request.to_email,
            tracking_id=None,
            delivery_status="not_sent",
            detail="Lead not approved. Set approved=true to send.",
        )

    email_draft = lead.get("email_draft") if isinstance(lead.get("email_draft"), dict) else {}
    subject = str(lead.get("email_subject") or email_draft.get("subject") or "").strip()
    body = str(lead.get("email_body") or email_draft.get("body") or "").strip()
    if not subject or not body:
        raise HTTPException(status_code=400, detail="Lead does not contain a generated email draft.")

    recipient = str(request.to_email).strip() or str(
        lead.get("email_send_recipient_hint") or lead.get("email_hint") or ""
    ).strip()
    if "@" not in recipient:
        raise HTTPException(
            status_code=400,
            detail="Recipient email is required. Provide to_email or ensure lead has a valid email hint.",
        )

    sender_name = request.from_name or os.getenv("BREVO_SENDER_NAME", "HuntR")
    sender_email = request.from_email or os.getenv("BREVO_SENDER_EMAIL", "hello@huntr.ai")
    tracking_id = str(uuid4())
    tracking_pixel = (
        f'<img src="{TRACKING_PIXEL_BASE_URL}/track/{tracking_id}" '
        'width="1" height="1" style="display:none"/>'
    )
    body_with_tracking = f"{body}\n\n{tracking_pixel}"

    result = email_tool.send_email(
        to=recipient,
        subject=subject,
        body=body_with_tracking,
        from_name=sender_name,
        from_email=sender_email,
    )

    stored_tracking_id: str | None = None
    if str(result.get("status", "")).lower() == "sent":
        sent_at = _now_iso()
        with tracking_store_lock:
            tracking_store[tracking_id] = {
                "job_id": job_id,
                "lead_id": lead_id,
                "sent_at": sent_at,
                "opened": False,
                "opened_at": None,
            }
        stored_tracking_id = tracking_id

    _record_step(
        job_id=job_id,
        agent="sender",
        action="email_send",
        result_summary=f"Lead {lead_id} send status: {result.get('status', 'unknown')}.",
        timestamp=_now_iso(),
        payload={},
    )

    return SendLeadResponse(
        job_id=job_id,
        lead_id=lead_id,
        status=str(result.get("status", "failed")),
        provider=str(result.get("provider", "brevo-smtp")),
        recipient=str(result.get("recipient", recipient)),
        tracking_id=stored_tracking_id,
        delivery_status=(
            str(result.get("delivery_status"))
            if result.get("delivery_status") is not None
            else None
        ),
        detail=(str(result.get("detail")) if result.get("detail") is not None else None),
    )


@app.get("/track/{tracking_id}/status")
def get_tracking_status(tracking_id: str) -> dict[str, Any]:
    with tracking_store_lock:
        tracking_data = tracking_store.get(tracking_id)
        snapshot = dict(tracking_data) if tracking_data is not None else None

    if snapshot is None:
        return {
            "tracking_id": tracking_id,
            "opened": False,
            "opened_at": None,
            "job_id": None,
            "lead_id": None,
        }

    return {
        "tracking_id": tracking_id,
        "opened": bool(snapshot.get("opened", False)),
        "opened_at": snapshot.get("opened_at"),
        "job_id": snapshot.get("job_id"),
        "lead_id": snapshot.get("lead_id"),
    }


@app.get("/track/{tracking_id}")
def track_email_open(tracking_id: str) -> Response:
    with tracking_store_lock:
        tracking_data = tracking_store.get(tracking_id)
        if tracking_data is not None:
            tracking_data["opened"] = True
            tracking_data["opened_at"] = _now_iso()

    return Response(content=TRACKING_GIF_BYTES, media_type="image/gif")

# cache-bust 20260419223004
