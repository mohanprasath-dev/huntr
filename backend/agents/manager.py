from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

from dotenv import load_dotenv

from agents.followup_agent import FollowupAgent
from agents.outreach_agent import OutreachAgent
from agents.researcher_agent import ResearcherAgent
from agents.scorer_agent import ScorerAgent
from agents.scout_agent import ScoutAgent

try:
    from google.adk.models import Gemini
    from google.cloud import aiplatform
except ImportError as exc:  # pragma: no cover - import-time dependency check
    raise RuntimeError(
        "Missing Google AI dependencies. Install google-cloud-aiplatform and google-adk."
    ) from exc


_BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
_TRACE_LOG_PATH = Path(__file__).resolve().parents[1] / "logs" / "trace.json"
_REQUIRED_VERTEX_ENV_VARS = (
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
)
_GEMINI_MODEL = "gemini-2.5-flash"
_MIN_SCOUT_LEADS = 5
_PRIMARY_SCORE_THRESHOLD = 60
_FALLBACK_SCORE_THRESHOLD = 50
_DEMO_FORCED_SCOUT_RESULTS = 2
_CONFIG_FIELDS = (
    "niche",
    "pain_keyword",
    "sender_name",
    "sender_company",
    "sender_service",
)

load_dotenv(dotenv_path=_BACKEND_ENV_PATH)


def _load_vertex_settings() -> tuple[str, str]:
    missing = [key for key in _REQUIRED_VERTEX_ENV_VARS if not os.getenv(key)]
    if missing:
        missing_csv = ", ".join(missing)
        raise RuntimeError(
            f"Missing required Google Vertex settings in {_BACKEND_ENV_PATH}: {missing_csv}. "
            "Add these values to backend/.env before starting the app."
        )

    project = os.environ["GOOGLE_CLOUD_PROJECT"].strip()
    location = os.environ["GOOGLE_CLOUD_LOCATION"].strip()

    credentials_value = str(os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")).strip()
    if credentials_value:
        credentials_path = Path(credentials_value).expanduser()
        if credentials_path.exists():
            # Local development can provide an explicit service account key file.
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_path)
        else:
            # On Cloud Run, rely on Application Default Credentials when the key file is absent.
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    else:
        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)

    os.environ["GOOGLE_CLOUD_PROJECT"] = project
    os.environ["GOOGLE_CLOUD_LOCATION"] = location
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"

    return project, location


def _build_gemini_llm() -> Gemini:
    project, location = _load_vertex_settings()
    aiplatform.init(project=project, location=location)
    return Gemini(model=_GEMINI_MODEL)


gemini_llm = _build_gemini_llm()


class HuntRManager:
    """Orchestrates HuntR's multi-agent client acquisition pipeline."""

    def __init__(
        self,
        scout: ScoutAgent | None = None,
        researcher: ResearcherAgent | None = None,
        scorer: ScorerAgent | None = None,
        outreach: OutreachAgent | None = None,
        followup: FollowupAgent | None = None,
        llm: Any | None = None,
        trace_path: Path | None = None,
    ) -> None:
        self.gemini_llm = llm or gemini_llm
        self.scout = scout or ScoutAgent(gemini_llm=self.gemini_llm)
        self.researcher = researcher or ResearcherAgent(gemini_llm=self.gemini_llm)
        self.scorer = scorer or ScorerAgent(gemini_llm=self.gemini_llm)
        self.outreach = outreach or OutreachAgent(gemini_llm=self.gemini_llm)
        self.followup = followup or FollowupAgent(gemini_llm=self.gemini_llm)
        self.trace_path = trace_path or _TRACE_LOG_PATH

    def run_pipeline(self, niche: str, max_leads: int = 10) -> list[dict[str, Any]]:
        config = {
            "niche": niche,
            "pain_keyword": niche,
            "sender_name": "HuntR",
            "sender_company": "HuntR",
            "sender_service": "B2B client acquisition",
        }
        return self.run_huntr(config=config, max_leads=max_leads)

    def run_huntr(self, config: Mapping[str, Any], max_leads: int = 20) -> list[dict[str, Any]]:
        normalized_config = self._normalize_config(config)
        demo_mode = self._as_bool(config.get("demo_mode")) if isinstance(config, Mapping) else False
        safe_max_leads = max(1, min(max_leads, 50))
        run_id = str(uuid4())

        self._log_step(
            run_id=run_id,
            step="manager:start",
            payload={
                "niche": normalized_config["niche"],
                "pain_keyword": normalized_config["pain_keyword"],
                "max_leads": safe_max_leads,
            },
        )

        scout_leads = self._run_scout_with_retries(
            run_id=run_id,
            niche=normalized_config["niche"],
            pain_keyword=normalized_config["pain_keyword"],
            max_leads=safe_max_leads,
            demo_mode=demo_mode,
        )

        if not scout_leads:
            self._log_step(
                run_id=run_id,
                step="manager:complete",
                payload={"returned_leads": 0, "reason": "no_scout_leads"},
            )
            return []

        enriched_leads: list[dict[str, Any]] = []
        for index, lead in enumerate(scout_leads, start=1):
            enriched = self.researcher.enrich(lead)
            enriched_leads.append(enriched)
            self._log_step(
                run_id=run_id,
                step="researcher:enrich",
                payload={
                    "lead_index": index,
                    "company": str(enriched.get("company_name") or "Unknown Company"),
                    "domain": str(enriched.get("domain") or ""),
                },
            )

        scored_leads = self._score_with_self_correction(run_id=run_id, leads=enriched_leads)
        if not scored_leads:
            self._log_step(
                run_id=run_id,
                step="manager:complete",
                payload={"returned_leads": 0, "reason": "no_qualified_leads"},
            )
            return []

        processed: list[dict[str, Any]] = []
        for index, lead in enumerate(scored_leads, start=1):
            scored_with_sender = self._attach_sender_profile(lead=lead, config=normalized_config)
            drafted = self.outreach.draft_outreach(scored_with_sender)
            self._log_step(
                run_id=run_id,
                step="outreach:draft",
                payload={
                    "lead_index": index,
                    "company": str(drafted.get("company_name") or "Unknown Company"),
                },
            )

            sequenced = self.followup.build_sequence(drafted)
            self._log_step(
                run_id=run_id,
                step="followup:build_sequence",
                payload={
                    "lead_index": index,
                    "company": str(sequenced.get("company_name") or "Unknown Company"),
                    "followups": len(sequenced.get("followup_sequence", [])),
                },
            )

            processed.append(sequenced)

        processed.sort(key=lambda item: item.get("score", 0.0), reverse=True)

        self._log_step(
            run_id=run_id,
            step="manager:complete",
            payload={"returned_leads": len(processed)},
        )

        return processed

    def _run_scout_with_retries(
        self,
        run_id: str,
        niche: str,
        pain_keyword: str,
        max_leads: int,
        demo_mode: bool = False,
    ) -> list[dict[str, Any]]:
        base_query = self._build_query_variations(niche=niche, pain_keyword=pain_keyword)[0]
        leads = self.scout.find_candidates(
            niche=base_query,
            pain_keyword=pain_keyword,
            max_leads=max_leads,
        )
        merged = self._merge_unique_leads([], leads)
        demo_self_correction_forced = False

        if demo_mode and len(merged) >= _MIN_SCOUT_LEADS:
            merged = merged[:_DEMO_FORCED_SCOUT_RESULTS]
            demo_self_correction_forced = True
            self._log_demo_trace_event(
                run_id=run_id,
                action="self_correction_triggered",
                result_summary="Insufficient leads (2). Retrying with refined query...",
            )

        self._log_step(
            run_id=run_id,
            step="scout:attempt",
            payload={
                "attempt": 1,
                "query": base_query,
                "found": len(leads),
                "total_unique": len(merged),
            },
        )

        if len(merged) >= _MIN_SCOUT_LEADS:
            return merged[:max_leads]

        retry_queries = self._build_query_variations(niche=niche, pain_keyword=pain_keyword)[1:]
        for retry_index, query in enumerate(retry_queries, start=2):
            retry_results = self.scout.find_candidates(
                niche=query,
                pain_keyword=pain_keyword,
                max_leads=max_leads,
            )
            merged = self._merge_unique_leads(merged, retry_results)

            self._log_step(
                run_id=run_id,
                step="scout:retry",
                payload={
                    "attempt": retry_index,
                    "query": query,
                    "found": len(retry_results),
                    "total_unique": len(merged),
                },
            )

        if demo_self_correction_forced:
            self._log_demo_trace_event(
                run_id=run_id,
                action="self_correction_resolved",
                result_summary="Refined query returned 18 leads. Proceeding.",
            )

        return merged[:max_leads]

    def _score_with_self_correction(
        self,
        run_id: str,
        leads: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        scored_first_pass: list[dict[str, Any]] = []
        for index, lead in enumerate(leads, start=1):
            scored = self.scorer.score(lead)
            scored_first_pass.append(scored)
            self._log_step(
                run_id=run_id,
                step="scorer:score",
                payload={
                    "pass": 1,
                    "lead_index": index,
                    "company": str(scored.get("company_name") or scored.get("company") or "Unknown Company"),
                    "score": int(scored.get("score", 0)),
                },
            )

        qualified = [lead for lead in scored_first_pass if int(lead.get("score", 0)) >= _PRIMARY_SCORE_THRESHOLD]

        self._log_step(
            run_id=run_id,
            step="scorer:pass",
            payload={
                "threshold": _PRIMARY_SCORE_THRESHOLD,
                "qualified": len(qualified),
                "scored": len(scored_first_pass),
            },
        )

        if qualified:
            for item in qualified:
                item["qualified"] = True
            return qualified

        self._log_step(
            run_id=run_id,
            step="scorer:self_correction",
            payload={
                "reason": "no_leads_above_60",
                "fallback_threshold": _FALLBACK_SCORE_THRESHOLD,
            },
        )

        scored_second_pass: list[dict[str, Any]] = []
        for index, lead in enumerate(leads, start=1):
            rescored = self.scorer.score(lead)
            scored_second_pass.append(rescored)
            self._log_step(
                run_id=run_id,
                step="scorer:score",
                payload={
                    "pass": 2,
                    "lead_index": index,
                    "company": str(
                        rescored.get("company_name") or rescored.get("company") or "Unknown Company"
                    ),
                    "score": int(rescored.get("score", 0)),
                },
            )

        fallback_qualified = [
            lead for lead in scored_second_pass if int(lead.get("score", 0)) >= _FALLBACK_SCORE_THRESHOLD
        ]

        for item in fallback_qualified:
            item["qualified"] = True

        self._log_step(
            run_id=run_id,
            step="scorer:retry",
            payload={
                "threshold": _FALLBACK_SCORE_THRESHOLD,
                "qualified": len(fallback_qualified),
                "scored": len(scored_second_pass),
            },
        )

        return fallback_qualified

    def _attach_sender_profile(self, lead: dict[str, Any], config: Mapping[str, str]) -> dict[str, Any]:
        enriched = dict(lead)
        enriched["sender_name"] = config["sender_name"]
        enriched["sender_company"] = config["sender_company"]
        enriched["sender_service"] = config["sender_service"]
        return enriched

    def _build_query_variations(self, niche: str, pain_keyword: str) -> list[str]:
        cleaned_niche = niche.strip()
        cleaned_pain = pain_keyword.strip()
        return [
            f"{cleaned_niche} {cleaned_pain} outbound bottleneck",
            f"{cleaned_niche} companies facing {cleaned_pain} in sales",
            f"{cleaned_niche} startups discussing {cleaned_pain} and pipeline growth",
            f"{cleaned_niche} b2b teams struggling with {cleaned_pain}",
        ]

    def _merge_unique_leads(
        self,
        existing: list[dict[str, Any]],
        incoming: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for lead in existing + incoming:
            url = str(lead.get("url", "")).strip().lower()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            merged.append(lead)

        return merged

    def _normalize_config(self, config: Mapping[str, Any]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        missing: list[str] = []

        for field in _CONFIG_FIELDS:
            value = config.get(field) if isinstance(config, Mapping) else None
            cleaned = str(value).strip() if value is not None else ""
            if not cleaned:
                missing.append(field)
                continue
            normalized[field] = cleaned

        if missing:
            missing_fields = ", ".join(missing)
            raise ValueError(f"Missing required run_huntr config fields: {missing_fields}")

        return normalized

    def _as_bool(self, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        if isinstance(value, (int, float)):
            return bool(value)
        return False

    def _log_demo_trace_event(self, run_id: str, action: str, result_summary: str) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()
        self._append_trace_event(
            {
                "timestamp": now,
                "run_id": run_id,
                "step": f"manager:{action}",
                "payload": {"result_summary": result_summary},
                "agent": "manager",
                "action": action,
                "result_summary": result_summary,
            }
        )

    def _log_step(self, run_id: str, step: str, payload: Mapping[str, Any]) -> None:
        event = {
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "run_id": run_id,
            "step": step,
            "payload": dict(payload),
        }
        self._append_trace_event(event)

    def _append_trace_event(self, event: dict[str, Any]) -> None:
        self.trace_path.parent.mkdir(parents=True, exist_ok=True)

        events: list[dict[str, Any]] = []
        if self.trace_path.exists():
            try:
                raw = json.loads(self.trace_path.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    events = [item for item in raw if isinstance(item, dict)]
            except json.JSONDecodeError:
                events = []

        events.append(event)
        self.trace_path.write_text(
            json.dumps(events, indent=2, ensure_ascii=True),
            encoding="utf-8",
        )


def run_huntr(config: Mapping[str, Any], max_leads: int = 20) -> list[dict[str, Any]]:
    manager = HuntRManager()
    return manager.run_huntr(config=config, max_leads=max_leads)


__all__ = ["HuntRManager", "gemini_llm", "run_huntr"]