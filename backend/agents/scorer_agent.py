from __future__ import annotations

from typing import Any

from tools.scorer_tool import LeadScorer, LeadSignals


class ScorerAgent:
    """Scores each lead for outreach priority."""

    def __init__(self, scorer: LeadScorer | None = None) -> None:
        self.scorer = scorer or LeadScorer()

    def score(self, lead: dict[str, Any]) -> dict[str, Any]:
        research = lead.get("research", {})
        tavily_results = research.get("tavily_results", [])
        linkedin_data = research.get("linkedin", {})

        signals = LeadSignals(
            icp_match=self._estimate_icp_match(lead),
            intent_strength=min(1.0, len(tavily_results) / 3),
            company_size_fit=self._estimate_company_size_fit(linkedin_data),
            decision_maker_reachability=self._estimate_reachability(linkedin_data),
        )

        total, tier = self.scorer.score(signals)

        scored = dict(lead)
        scored["score"] = round(total, 2)
        scored["tier"] = tier
        scored["signals"] = signals.as_dict()
        return scored

    def _estimate_icp_match(self, lead: dict[str, Any]) -> float:
        summary = (lead.get("summary") or "").lower()
        if "b2b" in summary or "saas" in summary:
            return 0.9
        return 0.6 if summary else 0.4

    def _estimate_company_size_fit(self, linkedin_data: dict[str, Any]) -> float:
        employee_count = linkedin_data.get("employee_count")
        if not employee_count:
            return 0.5

        if 20 <= employee_count <= 500:
            return 0.9
        if 10 <= employee_count <= 1000:
            return 0.7
        return 0.4

    def _estimate_reachability(self, linkedin_data: dict[str, Any]) -> float:
        website = linkedin_data.get("website")
        followers = linkedin_data.get("follower_count", 0)

        score = 0.3
        if website:
            score += 0.3
        if followers and followers > 1000:
            score += 0.3

        return min(score, 1.0)
