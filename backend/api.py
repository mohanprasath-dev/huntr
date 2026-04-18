from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.manager import HuntRManager
from tools.email_tool import BrevoEmailTool

load_dotenv()

app = FastAPI(title="HuntR API", version="0.1.0")
email_tool = BrevoEmailTool()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
TERMINAL_STATUSES = {"completed", "failed"}


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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


def _job_or_404(job_id: str) -> dict[str, Any]:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
        return dict(job)


def _build_result_summary(agent: str, action: str, payload: Any) -> str:
    if not isinstance(payload, dict) or not payload:
        return f"{agent} {action}"

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
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            return

        safe_payload = payload or {}
        if agent == "scout":
            total_unique = _to_int(safe_payload.get("total_unique"))
            found = _to_int(safe_payload.get("found"))
            if total_unique is not None:
                job["leads_found"] = max(int(job.get("leads_found", 0)), total_unique)
            elif found is not None:
                job["leads_found"] = max(int(job.get("leads_found", 0)), found)

        if agent == "scorer":
            scored = _to_int(safe_payload.get("scored"))
            lead_index = _to_int(safe_payload.get("lead_index"))
            if scored is not None:
                job["leads_scored"] = max(int(job.get("leads_scored", 0)), scored)
            elif lead_index is not None and action == "score":
                job["leads_scored"] = max(int(job.get("leads_scored", 0)), lead_index)

        job["current_agent"] = agent
        event = {
            "agent": agent,
            "action": action,
            "result_summary": result_summary,
            "timestamp": timestamp,
        }
        job.setdefault("events", []).append(event)
        job["steps_completed"] = len(job.get("events", []))


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
                "email_draft": {
                    "subject": lead.get("email_subject") or "",
                    "body": lead.get("email_body") or "",
                },
                "linkedin_draft": lead.get("linkedin_message") or "",
                "followup_sequence": lead.get("followup_sequence") or [],
            }
        )
    return formatted


def _run_hunt_job(job_id: str, config: dict[str, str]) -> None:
    trace_path = Path(__file__).resolve().parent / "logs" / f"trace_{job_id}.json"

    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            return
        job["status"] = "running"
        job["current_agent"] = "manager"
        job["trace_path"] = str(trace_path)

    try:
        manager = HuntRManager(trace_path=trace_path)
    except Exception as exc:  # pragma: no cover - environment/bootstrap sensitive path
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job is not None:
                job["status"] = "failed"
                job["error"] = str(exc)
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
            result_box["leads"] = manager.run_huntr(config=config, max_leads=20)
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
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job is not None:
                job["status"] = "failed"
                job["error"] = error_box["error"]
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
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            return
        job["status"] = "completed"
        job["raw_leads"] = raw_leads
        job["leads"] = formatted
        if int(job.get("leads_found", 0)) == 0:
            job["leads_found"] = len(raw_leads)
        if int(job.get("leads_scored", 0)) == 0:
            job["leads_scored"] = len(raw_leads)

    _record_step(
        job_id=job_id,
        agent="manager",
        action="ready",
        result_summary=f"Job complete. {len(formatted)} leads ready.",
        timestamp=_now_iso(),
        payload={},
    )


class HuntRequest(BaseModel):
    niche: str = Field(..., min_length=2)
    pain_keyword: str = Field(..., min_length=2)
    sender_name: str = Field(..., min_length=1)
    sender_company: str = Field(..., min_length=1)
    sender_service: str = Field(..., min_length=1)


class HuntStartResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    current_agent: str
    leads_found: int
    leads_scored: int
    steps_completed: int


class JobLeadsResponse(BaseModel):
    job_id: str
    leads: list[dict[str, Any]]


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
    delivery_status: str | None = None
    detail: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "huntr-backend",
        "project": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
        "location": os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
    }


@app.post("/hunt", response_model=HuntStartResponse)
def run_hunt(request: HuntRequest) -> HuntStartResponse:
    job_id = str(uuid4())
    config = {
        "niche": request.niche.strip(),
        "pain_keyword": request.pain_keyword.strip(),
        "sender_name": request.sender_name.strip(),
        "sender_company": request.sender_company.strip(),
        "sender_service": request.sender_service.strip(),
    }

    with JOBS_LOCK:
        JOBS[job_id] = {
            "job_id": job_id,
            "status": "started",
            "current_agent": "manager",
            "leads_found": 0,
            "leads_scored": 0,
            "steps_completed": 0,
            "events": [],
            "raw_leads": [],
            "leads": [],
            "config": config,
            "created_at": _now_iso(),
        }

    worker = threading.Thread(target=_run_hunt_job, args=(job_id, config), daemon=True)
    worker.start()
    return HuntStartResponse(job_id=job_id, status="started")


@app.get("/status/{job_id}", response_model=JobStatusResponse)
def get_status(job_id: str) -> JobStatusResponse:
    job = _job_or_404(job_id)
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
    job = _job_or_404(job_id)
    return JobLeadsResponse(job_id=job_id, leads=list(job.get("leads", [])))


@app.get("/stream/{job_id}")
async def stream_job(job_id: str) -> StreamingResponse:
    _job_or_404(job_id)

    async def _event_generator() -> Any:
        cursor = 0
        while True:
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if job is None:
                    break
                events = list(job.get("events", []))
                status = str(job.get("status", "unknown"))

            while cursor < len(events):
                event = events[cursor]
                cursor += 1
                yield f"data: {json.dumps(event, ensure_ascii=True)}\n\n"

            if status in TERMINAL_STATUSES:
                break

            await asyncio.sleep(0.4)

        terminal_event = {
            "agent": "manager",
            "action": "stream_closed",
            "result_summary": "Job stream closed.",
            "timestamp": _now_iso(),
        }
        yield f"data: {json.dumps(terminal_event, ensure_ascii=True)}\n\n"

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/send/{job_id}/{lead_id}", response_model=SendLeadResponse)
def send_for_lead(job_id: str, lead_id: int, request: SendLeadRequest) -> SendLeadResponse:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")

        if str(job.get("status")) != "completed":
            raise HTTPException(status_code=409, detail="Job is not completed yet.")

        raw_leads = list(job.get("raw_leads", []))

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
            delivery_status="not_sent",
            detail="Lead not approved. Set approved=true to send.",
        )

    subject = str(lead.get("email_subject") or "").strip()
    body = str(lead.get("email_body") or "").strip()
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
    result = email_tool.send_email(
        to=recipient,
        subject=subject,
        body=body,
        from_name=sender_name,
        from_email=sender_email,
    )

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
        delivery_status=(
            str(result.get("delivery_status"))
            if result.get("delivery_status") is not None
            else None
        ),
        detail=(str(result.get("detail")) if result.get("detail") is not None else None),
    )
