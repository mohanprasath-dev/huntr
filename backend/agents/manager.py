from __future__ import annotations

import os
from pathlib import Path
from typing import Any

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
_REQUIRED_VERTEX_ENV_VARS = (
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_LOCATION",
    "GOOGLE_APPLICATION_CREDENTIALS",
)
_GEMINI_MODEL = "gemini-2.5-flash"

load_dotenv(dotenv_path=_BACKEND_ENV_PATH)


def _load_vertex_settings() -> tuple[str, str]:
    missing = [key for key in _REQUIRED_VERTEX_ENV_VARS if not os.getenv(key)]
    if missing:
        missing_csv = ", ".join(missing)
        raise RuntimeError(
            f"Missing required Google Vertex credentials in {_BACKEND_ENV_PATH}: {missing_csv}. "
            "Add these values to backend/.env before starting the app."
        )

    project = os.environ["GOOGLE_CLOUD_PROJECT"].strip()
    location = os.environ["GOOGLE_CLOUD_LOCATION"].strip()
    credentials_path = Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]).expanduser()

    if not credentials_path.exists():
        raise RuntimeError(
            "GOOGLE_APPLICATION_CREDENTIALS points to a missing file: "
            f"{credentials_path}. Update backend/.env with a valid key path."
        )

    os.environ["GOOGLE_CLOUD_PROJECT"] = project
    os.environ["GOOGLE_CLOUD_LOCATION"] = location
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_path)
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
    ) -> None:
        self.gemini_llm = llm or gemini_llm
        self.scout = scout or ScoutAgent(gemini_llm=self.gemini_llm)
        self.researcher = researcher or ResearcherAgent(gemini_llm=self.gemini_llm)
        self.scorer = scorer or ScorerAgent(gemini_llm=self.gemini_llm)
        self.outreach = outreach or OutreachAgent(gemini_llm=self.gemini_llm)
        self.followup = followup or FollowupAgent(gemini_llm=self.gemini_llm)

    def run_pipeline(self, niche: str, max_leads: int = 10) -> list[dict[str, Any]]:
        leads = self.scout.find_candidates(niche=niche, max_leads=max_leads)

        processed: list[dict[str, Any]] = []
        for lead in leads:
            enriched = self.researcher.enrich(lead)
            scored = self.scorer.score(enriched)
            drafted = self.outreach.draft_outreach(scored)
            sequenced = self.followup.build_sequence(drafted)
            processed.append(sequenced)

        processed.sort(key=lambda item: item.get("score", 0.0), reverse=True)
        return processed


__all__ = ["HuntRManager", "gemini_llm"]