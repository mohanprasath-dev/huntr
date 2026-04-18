from __future__ import annotations

from typing import Any

from agents.followup_agent import FollowupAgent
from agents.outreach_agent import OutreachAgent
from agents.researcher_agent import ResearcherAgent
from agents.scorer_agent import ScorerAgent
from agents.scout_agent import ScoutAgent


class HuntRManager:
    """Orchestrates HuntR's multi-agent client acquisition pipeline."""

    def __init__(
        self,
        scout: ScoutAgent | None = None,
        researcher: ResearcherAgent | None = None,
        scorer: ScorerAgent | None = None,
        outreach: OutreachAgent | None = None,
        followup: FollowupAgent | None = None,
    ) -> None:
        self.scout = scout or ScoutAgent()
        self.researcher = researcher or ResearcherAgent()
        self.scorer = scorer or ScorerAgent()
        self.outreach = outreach or OutreachAgent()
        self.followup = followup or FollowupAgent()

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