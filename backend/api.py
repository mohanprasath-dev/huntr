from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel, Field

from agents.manager import HuntRManager
from tools.email_tool import BrevoEmailTool

load_dotenv()

app = FastAPI(title="HuntR API", version="0.1.0")
manager = HuntRManager()
email_tool = BrevoEmailTool()


class HuntRequest(BaseModel):
    niche: str = Field(..., min_length=2, description="Target niche, e.g. B2B fintech")
    max_leads: int = Field(default=10, ge=1, le=50)


class HuntResponse(BaseModel):
    niche: str
    leads: list[dict[str, Any]]


class SendEmailRequest(BaseModel):
    recipient: str = Field(..., min_length=3)
    subject: str = Field(..., min_length=3)
    body: str = Field(..., min_length=10)
    dry_run: bool = True


class SendEmailResponse(BaseModel):
    status: str
    provider: str
    recipient: str
    detail: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "huntr-backend",
        "project": os.getenv("GOOGLE_CLOUD_PROJECT", ""),
        "location": os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
    }


@app.post("/api/v1/hunt", response_model=HuntResponse)
def run_hunt(request: HuntRequest) -> HuntResponse:
    leads = manager.run_pipeline(niche=request.niche, max_leads=request.max_leads)
    return HuntResponse(niche=request.niche, leads=leads)


@app.post("/api/v1/outreach/send", response_model=SendEmailResponse)
def send_outreach_email(request: SendEmailRequest) -> SendEmailResponse:
    result = email_tool.send_email(
        to_email=request.recipient,
        subject=request.subject,
        body=request.body,
        dry_run=request.dry_run,
    )
    return SendEmailResponse(
        status=result.get("status", "failed"),
        provider=result.get("provider", "brevo-smtp"),
        recipient=result.get("recipient", request.recipient),
        detail=result.get("detail"),
    )
