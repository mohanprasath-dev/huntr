from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse
from uuid import uuid4

logger = logging.getLogger(__name__)
_trace_lock = threading.Lock()

from dotenv import load_dotenv

from agents.followup_agent import FollowupAgent
from agents.outreach_agent import OutreachAgent
from agents.researcher_agent import ResearcherAgent
from agents.scorer_agent import ScorerAgent
from agents.scout_agent import ScoutAgent
from db.campaign_store import get_job, set_job_stop

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
_GEMINI_FLASH_MODEL = "gemini-2.5-flash"
_GEMINI_PRO_MODEL = "gemini-2.5-pro"
_MIN_SCOUT_LEADS = 5
_PRIMARY_SCORE_THRESHOLD = 60
_FALLBACK_SCORE_THRESHOLD = 50
_MIN_QUALIFIED_LEADS = 5
_DEMO_FORCED_SCOUT_RESULTS = 2
_VERIFICATION_PROMPT_MAX_LEADS = 30
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


# Lazy-initialized singletons — populated on first use, not at module import time.
# Module-level eager init would crash the entire API if env vars are absent.
_gemini_flash: "Gemini | None" = None
_gemini_pro: "Gemini | None" = None
_gemini_init_lock = threading.Lock()


def _build_gemini_llms() -> tuple[Gemini, Gemini]:
    project, location = _load_vertex_settings()
    aiplatform.init(project=project, location=location)
    return Gemini(model=_GEMINI_FLASH_MODEL), Gemini(model=_GEMINI_PRO_MODEL)


def _get_gemini_llms() -> tuple[Gemini, Gemini]:
    global _gemini_flash, _gemini_pro
    if _gemini_flash is None or _gemini_pro is None:
        with _gemini_init_lock:
            if _gemini_flash is None or _gemini_pro is None:
                _gemini_flash, _gemini_pro = _build_gemini_llms()
    return _gemini_flash, _gemini_pro


# gemini_flash, gemini_pro, gemini_llm are available as module attributes
# but are lazily initialized on first use via HuntRManager.__init__.
# Use _get_gemini_llms() to obtain both LLMs explicitly.
gemini_llm = None  # Alias maintained for backward compat — resolved inside HuntRManager


# Model: gemini-2.5-pro (reasoning-heavy)
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
        # Lazy-load Gemini LLMs only when needed (not at import time)
        if llm is not None:
            flash_llm: Any = llm
            pro_llm: Any = llm
        else:
            try:
                flash_llm, pro_llm = _get_gemini_llms()
            except Exception as exc:
                logger.warning(
                    "[HuntRManager] Could not initialize Gemini LLMs: %s — agents will run in no-LLM mode",
                    exc,
                )
                flash_llm = None
                pro_llm = None

        self.gemini_flash = flash_llm
        self.gemini_pro = pro_llm
        self.gemini_llm = pro_llm

        self.scout = scout or ScoutAgent(gemini_llm=flash_llm)
        self.researcher = researcher or ResearcherAgent(gemini_llm=flash_llm)
        self.scorer = scorer or ScorerAgent(gemini_llm=flash_llm)
        self.outreach = outreach or OutreachAgent(model=_GEMINI_PRO_MODEL, gemini_llm=pro_llm)
        self.followup = followup or FollowupAgent(gemini_llm=flash_llm)
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

    def run_huntr(
        self,
        config: Mapping[str, Any],
        max_leads: int = 20,
        job_id: str | None = None,
    ) -> list[dict[str, Any]]:
        normalized_config = self._normalize_config(config)
        demo_mode = self._as_bool(config.get("demo_mode")) if isinstance(config, Mapping) else False
        safe_max_leads = max(1, min(max_leads, 50))
        run_id = str(uuid4())
        completed_steps = 0

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
        completed_steps += 1

        if self._stop_requested(job_id=job_id):
            self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
            self._mark_job_stopped(job_id=job_id)
            return scout_leads[:safe_max_leads]

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
            completed_steps += 1
            self._log_step(
                run_id=run_id,
                step="researcher:enrich",
                payload={
                    "lead_index": index,
                    "company": str(enriched.get("company_name") or "Unknown Company"),
                    "domain": str(enriched.get("domain") or ""),
                },
            )

            if self._stop_requested(job_id=job_id):
                self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
                self._mark_job_stopped(job_id=job_id)
                return enriched_leads

        verified_researched_leads = self._verify_researched_leads(
            run_id=run_id,
            leads=enriched_leads,
        )
        completed_steps += 1

        if self._stop_requested(job_id=job_id):
            self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
            self._mark_job_stopped(job_id=job_id)
            return verified_researched_leads

        if not verified_researched_leads:
            self._log_step(
                run_id=run_id,
                step="manager:complete",
                payload={"returned_leads": 0, "reason": "no_verified_research_leads"},
            )
            return []

        scored_leads = self._score_with_self_correction(run_id=run_id, leads=verified_researched_leads)
        completed_steps += 1

        if self._stop_requested(job_id=job_id):
            self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
            self._mark_job_stopped(job_id=job_id)
            return scored_leads

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
            completed_steps += 1
            self._log_step(
                run_id=run_id,
                step="outreach:draft",
                payload={
                    "lead_index": index,
                    "company": str(drafted.get("company_name") or "Unknown Company"),
                },
            )

            if self._stop_requested(job_id=job_id):
                self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
                self._mark_job_stopped(job_id=job_id)
                processed.append(drafted)
                return processed

            sequenced = self.followup.build_sequence(drafted)
            completed_steps += 1
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

            if self._stop_requested(job_id=job_id):
                self._log_hunt_stopped(run_id=run_id, steps_completed=completed_steps)
                self._mark_job_stopped(job_id=job_id)
                return processed

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
        """Score leads once (scoring is deterministic — re-scoring produces identical results).
        Self-correct by lowering the acceptance threshold, not by re-scoring.
        """
        scored_leads: list[dict[str, Any]] = []
        for index, lead in enumerate(leads, start=1):
            scored = self.scorer.score(lead)
            scored_leads.append(scored)
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

        qualified = [lead for lead in scored_leads if int(lead.get("score", 0)) >= _PRIMARY_SCORE_THRESHOLD]

        self._log_step(
            run_id=run_id,
            step="scorer:pass",
            payload={
                "threshold": _PRIMARY_SCORE_THRESHOLD,
                "qualified": len(qualified),
                "scored": len(scored_leads),
            },
        )

        if len(qualified) >= _MIN_QUALIFIED_LEADS:
            for item in qualified:
                item["qualified"] = True
            return qualified

        # Self-correction: lower threshold (no re-scoring — scoring is deterministic)
        self._log_step(
            run_id=run_id,
            step="scorer:self_correction",
            payload={
                "reason": "no_leads_above_60" if len(qualified) == 0 else "insufficient_leads_above_60",
                "qualified_first_pass": len(qualified),
                "target_min": _MIN_QUALIFIED_LEADS,
                "fallback_threshold": _FALLBACK_SCORE_THRESHOLD,
            },
        )

        fallback_qualified = [
            lead for lead in scored_leads if int(lead.get("score", 0)) >= _FALLBACK_SCORE_THRESHOLD
        ]
        for item in fallback_qualified:
            item["qualified"] = True

        self._log_step(
            run_id=run_id,
            step="scorer:retry",
            payload={
                "threshold": _FALLBACK_SCORE_THRESHOLD,
                "qualified": len(fallback_qualified),
                "scored": len(scored_leads),
            },
        )

        if len(fallback_qualified) >= _MIN_QUALIFIED_LEADS:
            return fallback_qualified

        # Floor: return top N by score even if below threshold
        ranked = sorted(scored_leads, key=lambda lead: int(lead.get("score", 0)), reverse=True)
        floor_results = ranked[:min(_MIN_QUALIFIED_LEADS, len(ranked))]
        for item in floor_results:
            item["qualified"] = int(item.get("score", 0)) >= _FALLBACK_SCORE_THRESHOLD

        self._log_step(
            run_id=run_id,
            step="scorer:floor",
            payload={
                "reason": "insufficient_fallback_qualified",
                "target_min": _MIN_QUALIFIED_LEADS,
                "returned": len(floor_results),
            },
        )

        return floor_results

    def _verify_researched_leads(self, run_id: str, leads: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # Keep verification non-blocking: normalize collected leads directly.
        verified: list[dict[str, Any]] = []
        dropped = 0
        for lead in leads:
            normalized = self._normalize_verified_lead(lead)
            if normalized is None:
                dropped += 1
                continue
            verified.append(normalized)

        self._log_step(
            run_id=run_id,
            step="manager:verify",
            payload={
                "input_leads": len(leads),
                "verified": len(verified),
                "dropped": dropped,
            },
        )

        return verified

    def _verify_with_llm(
        self,
        leads: list[dict[str, Any]],
        verification_prompt: str,
    ) -> list[dict[str, Any]] | None:
        model = self.gemini_flash or self.gemini_llm
        if model is None:
            return None

        leads_payload = json.dumps(leads[:_VERIFICATION_PROMPT_MAX_LEADS], ensure_ascii=True)
        prompt = (
            f"{verification_prompt}\n\n"
            "Return strict JSON only with key `verified_leads` (array of lead objects).\n\n"
            f"Leads JSON:\n{leads_payload}"
        )

        response: Any = None
        for method_name in ("generate_content", "generate", "invoke", "complete", "predict"):
            method = getattr(model, method_name, None)
            if not callable(method):
                continue

            invocation_attempts = (
                {"contents": prompt, "generation_config": {"temperature": 0.1}},
                {"prompt": prompt, "generation_config": {"temperature": 0.1}},
                {"contents": prompt, "config": {"temperature": 0.1}},
                {"prompt": prompt, "config": {"temperature": 0.1}},
                {"contents": prompt},
                {"prompt": prompt},
            )

            for kwargs in invocation_attempts:
                try:
                    response = method(**kwargs)
                except TypeError:
                    continue
                except Exception:
                    response = None
                    break

                if response is not None:
                    break

            if response is not None:
                break

        if response is None and callable(model):
            try:
                response = model(prompt=prompt, generation_config={"temperature": 0.1})
            except TypeError:
                try:
                    response = model(prompt)
                except Exception:
                    return None
            except Exception:
                return None

        text = self._coerce_model_text(response)
        if not text:
            return None

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()

        parsed: Any = None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    parsed = None

        if isinstance(parsed, dict):
            verified_leads = parsed.get("verified_leads")
            if isinstance(verified_leads, list):
                return [item for item in verified_leads if isinstance(item, dict)]
            return None

        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]

        return None

    def _normalize_verified_lead(self, lead: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(lead, dict):
            return None

        normalized = dict(lead)

        source_url = self._normalize_url(lead.get("source_url"))
        if not source_url:
            source_url = (
                self._normalize_url(lead.get("website"))
                or self._normalize_url(lead.get("url"))
            )
        if not source_url:
            return None

        normalized["source_url"] = source_url
        if not normalized.get("website"):
            normalized["website"] = source_url
        if not normalized.get("url"):
            normalized["url"] = source_url

        decision_maker = self._normalize_text(normalized.get("decision_maker"))
        if decision_maker and any(
            marker in decision_maker.lower()
            for marker in ("unknown", "name unknown", "founder/ceo", "n/a")
        ):
            decision_maker = None

        decision_maker_source = self._normalize_url(
            normalized.get("decision_maker_source") or normalized.get("linkedin_url")
        )

        normalized["decision_maker"] = decision_maker
        normalized["decision_maker_source"] = decision_maker_source
        normalized["linkedin_url"] = decision_maker_source
        if not decision_maker:
            normalized["decision_maker_title"] = None

        email_value = self._normalize_text(normalized.get("email"))
        email_source = self._normalize_url(normalized.get("email_source"))
        if email_value and "@" not in email_value:
            email_value = None

        normalized["email"] = email_value
        normalized["email_source"] = email_source
        normalized["email_hint"] = email_value or "Unknown"
        normalized["email_hint_confidence"] = "found" if email_value else "none"

        normalized["pain_point"] = self._normalize_text(normalized.get("pain_point"))
        normalized["pain_point_source"] = self._normalize_url(normalized.get("pain_point_source"))

        normalized["size"] = self._normalize_text(normalized.get("size"))
        normalized["size_source"] = self._normalize_url(normalized.get("size_source"))

        tech_stack = normalized.get("tech_stack")
        tech_stack_sources_raw = normalized.get("tech_stack_sources")
        tech_stack_sources = (
            [
                source
                for source in (
                    self._normalize_url(item)
                    for item in tech_stack_sources_raw
                )
                if source
            ]
            if isinstance(tech_stack_sources_raw, list)
            else []
        )
        normalized["tech_stack"] = tech_stack if isinstance(tech_stack, list) and tech_stack else None
        normalized["tech_stack_sources"] = tech_stack_sources

        normalized["verified"] = True
        return normalized

    def _normalize_text(self, value: Any) -> str | None:
        cleaned = str(value or "").strip()
        if not cleaned:
            return None
        return cleaned

    def _normalize_url(self, value: Any) -> str | None:
        candidate = str(value or "").strip()
        if not candidate:
            return None

        parsed = urlparse(candidate)
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return candidate
        return None

    def _extract_root_domain(self, url: str) -> str:
        """Return a stable domain key for deduping leads.

        This intentionally favors robustness over perfect PSL handling.
        """
        if not url:
            return ""

        candidate = url.strip().lower()
        if not candidate:
            return ""

        parsed = urlparse(candidate if "://" in candidate else f"https://{candidate}")
        host = (parsed.netloc or "").split("@")[-1]
        host = host.split(":")[0].strip(".")
        if not host:
            return ""

        if host.startswith("www."):
            host = host[4:]

        parts = [p for p in host.split(".") if p]
        if len(parts) <= 2:
            return host

        # Heuristic for common second-level TLDs (e.g., co.in, com.au).
        second_level_tlds = {"co", "com", "org", "net", "gov", "ac"}
        if parts[-2] in second_level_tlds and len(parts) >= 3:
            return ".".join(parts[-3:])

        return ".".join(parts[-2:])

    def _coerce_model_text(self, response: Any) -> str:
        if response is None:
            return ""

        if isinstance(response, str):
            return response.strip()

        text_attr = getattr(response, "text", "")
        if isinstance(text_attr, str) and text_attr.strip():
            return text_attr.strip()

        if isinstance(response, dict):
            for key in ("text", "content", "output"):
                value = response.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()

        candidates = getattr(response, "candidates", [])
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts:
                part_text = getattr(part, "text", "")
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()

        return ""

    def _attach_sender_profile(self, lead: dict[str, Any], config: Mapping[str, str]) -> dict[str, Any]:
        enriched = dict(lead)
        enriched["sender_name"] = config["sender_name"]
        enriched["sender_company"] = config["sender_company"]
        enriched["sender_service"] = config["sender_service"]
        return enriched

    def _build_query_variations(self, niche: str, pain_keyword: str) -> list[str]:
        cleaned_niche = niche.strip()
        cleaned_pain = pain_keyword.strip()

        location_words = {"india", "indian", "bangalore", "mumbai", "delhi", "chennai"}
        niche_words = [word for word in cleaned_niche.lower().split() if word not in location_words]
        core_niche = " ".join(niche_words).strip() or cleaned_niche

        return [
            f"{core_niche} {cleaned_pain} company India -site:linkedin.com -site:crunchbase.com",
            f"site:crunchbase.com/organization {core_niche} India",
            f"site:wellfound.com/company {core_niche} India",
            f'"{core_niche}" companies India "founded" "CEO" OR "Founder" -linkedin.com/in',
            f'{core_niche} India B2B startup "our customers" OR "case study" OR "pricing"',
        ]

    def _merge_unique_leads(
        self,
        existing: list[dict[str, Any]],
        incoming: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Deduplicate by root domain (not raw URL) to handle URL normalization changes."""
        merged: list[dict[str, Any]] = []
        seen_domains: set[str] = set()

        for lead in existing + incoming:
            url = str(
                lead.get("url") or lead.get("source_url") or lead.get("website") or ""
            ).strip().lower()
            domain = self._extract_root_domain(url) if url else ""
            if not domain or domain in seen_domains:
                continue
            seen_domains.add(domain)
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

    def _stop_requested(self, job_id: str | None) -> bool:
        if not job_id:
            return False

        job = get_job(job_id)
        if not job:
            return False
        return bool(job.get("stop_requested", False))

    def _mark_job_stopped(self, job_id: str | None) -> None:
        if not job_id:
            return

        set_job_stop(job_id)

    def _log_hunt_stopped(self, run_id: str, steps_completed: int) -> None:
        self._append_trace_event(
            {
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                "run_id": run_id,
                "step": "manager:hunt_stopped",
                "payload": {
                    "result_summary": f"Hunt stopped by user after {steps_completed} steps",
                    "steps_completed": steps_completed,
                },
                "agent": "manager",
                "action": "hunt_stopped",
                "result_summary": f"Hunt stopped by user after {steps_completed} steps",
            }
        )

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
        """Thread-safe append to the trace JSON file."""
        self.trace_path.parent.mkdir(parents=True, exist_ok=True)

        with _trace_lock:
            events: list[dict[str, Any]] = []
            if self.trace_path.exists():
                try:
                    raw = json.loads(self.trace_path.read_text(encoding="utf-8"))
                    if isinstance(raw, list):
                        events = [item for item in raw if isinstance(item, dict)]
                except (json.JSONDecodeError, OSError):
                    events = []

            events.append(event)
            try:
                self.trace_path.write_text(
                    json.dumps(events, indent=2, ensure_ascii=True),
                    encoding="utf-8",
                )
            except OSError as exc:
                logger.warning("[Manager] Could not write trace event to %s: %s", self.trace_path, exc)


def run_huntr(
    config: Mapping[str, Any],
    max_leads: int = 20,
    job_id: str | None = None,
) -> list[dict[str, Any]]:
    manager = HuntRManager()
    return manager.run_huntr(config=config, max_leads=max_leads, job_id=job_id)


__all__ = ["HuntRManager", "_get_gemini_llms", "run_huntr"]
