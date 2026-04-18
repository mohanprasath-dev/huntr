from __future__ import annotations

import re
from typing import Any


class ScorerAgent:
    """Lead Scorer: ranks enriched leads against a 100-point qualification rubric."""

    name = "Lead Scorer"
    goal = "Score each enriched lead 1-100 based on budget signal, urgency, and fit"

    MIN_QUALIFIED_SCORE = 60

    _SIZE_RANGE_PATTERN = re.compile(r"(\d{1,4})\s*(?:-|to)\s*(\d{1,4})", re.IGNORECASE)
    _SIZE_SINGLE_PATTERN = re.compile(r"(\d{2,5})\+?")

    _PAIN_KEYWORDS = {
        "manual",
        "bottleneck",
        "struggle",
        "slow",
        "pipeline",
        "low conversion",
        "hiring",
        "missed target",
        "urgent",
        "need help",
        "outsource",
        "scaling",
    }
    _TECH_MODERN = {
        "python",
        "node.js",
        "fastapi",
        "django",
        "react",
        "next.js",
        "aws",
        "gcp",
        "azure",
        "kubernetes",
        "docker",
        "postgresql",
        "snowflake",
    }

    def __init__(
        self,
        gemini_llm: Any | None = None,
    ) -> None:
        self.gemini_llm = gemini_llm

    def score(self, lead: dict[str, Any]) -> dict[str, Any]:
        company_points, company_note = self._score_company_size(str(lead.get("size", "")))
        pain_points, pain_note = self._score_pain_signal(
            str(lead.get("pain_point") or lead.get("pain_signal") or "")
        )
        tech_points, tech_note = self._score_tech_maturity(lead.get("tech_stack"))
        reach_points, reach_note = self._score_decision_maker_reachability(
            decision_maker=str(lead.get("decision_maker", "")),
            email_hint=str(lead.get("email_hint") or lead.get("contact_hint") or ""),
        )

        total = company_points + pain_points + tech_points + reach_points
        tier = self._tier_for_score(total)
        reasoning = (
            f"Company size {company_points}/20 ({company_note}); "
            f"Pain signal {pain_points}/30 ({pain_note}); "
            f"Tech maturity {tech_points}/25 ({tech_note}); "
            f"Decision-maker reachability {reach_points}/25 ({reach_note})"
        )

        scored = dict(lead)
        scored["score"] = int(total)
        scored["tier"] = tier
        scored["qualified"] = total >= self.MIN_QUALIFIED_SCORE
        scored["reasoning"] = reasoning
        scored["score_breakdown"] = {
            "company_size": company_points,
            "pain_signal_strength": pain_points,
            "tech_maturity": tech_points,
            "decision_maker_reachability": reach_points,
        }
        return scored

    def rank_leads(self, enriched_leads: list[dict[str, Any]], top_k: int = 10) -> list[dict[str, Any]]:
        scored = [self.score(lead) for lead in enriched_leads]
        qualified = [lead for lead in scored if lead.get("score", 0) >= self.MIN_QUALIFIED_SCORE]
        qualified.sort(key=lambda item: item.get("score", 0), reverse=True)

        ranked: list[dict[str, Any]] = []
        for lead in qualified[: max(1, top_k)]:
            ranked.append(
                {
                    "company": lead.get("company") or lead.get("company_name") or "Unknown",
                    "score": lead.get("score", 0),
                    "reasoning": lead.get("reasoning", ""),
                    "lead": lead,
                }
            )

        return ranked

    def _score_company_size(self, size: str) -> tuple[int, str]:
        normalized_size = size.lower().strip()
        if not normalized_size or normalized_size == "unknown":
            return 8, "size unknown; neutral assumption"

        headcount = self._parse_headcount(normalized_size)
        if headcount is None:
            return 8, "size present but unstructured"

        if 20 <= headcount <= 500:
            return 20, "ideal B2B services buying band"
        if 10 <= headcount <= 1000:
            return 16, "reasonable budget potential"
        if 5 <= headcount <= 2000:
            return 12, "possible fit but weaker buying signal"
        return 6, "outside ideal size window"

    def _score_pain_signal(self, pain_text: str) -> tuple[int, str]:
        text = pain_text.lower().strip()
        if not text:
            return 6, "no explicit pain signal"

        matched = [keyword for keyword in self._PAIN_KEYWORDS if keyword in text]
        if len(matched) >= 4:
            return 30, "multiple strong urgency indicators"
        if len(matched) == 3:
            return 26, "strong pain indicators"
        if len(matched) == 2:
            return 22, "moderate pain indicators"
        if len(matched) == 1:
            return 17, "single pain indicator"
        return 12, "generic challenge language"

    def _score_tech_maturity(self, tech_stack: Any) -> tuple[int, str]:
        stack = self._normalize_stack(tech_stack)
        if not stack:
            return 8, "tech stack unknown"

        modern_matches = [item for item in stack if item in self._TECH_MODERN]
        if len(modern_matches) >= 5:
            return 25, "modern stack with high implementation readiness"
        if len(modern_matches) >= 3:
            return 21, "solid stack maturity"
        if len(modern_matches) >= 1:
            return 16, "partial modern stack"
        return 12, "limited technical maturity evidence"

    def _score_decision_maker_reachability(
        self,
        decision_maker: str,
        email_hint: str,
    ) -> tuple[int, str]:
        dm = decision_maker.lower().strip()
        email = email_hint.lower().strip()

        points = 0
        notes: list[str] = []

        if dm and dm != "unknown":
            points += 12
            notes.append("named decision maker found")
            if any(title in dm for title in ("ceo", "founder", "cto", "vp", "head")):
                points += 5
                notes.append("senior role identified")

        if "@" in email:
            points += 8
            notes.append("direct email found")
        elif "likely pattern" in email:
            points += 5
            notes.append("email pattern inferred")

        if "linkedin" in dm:
            points += 3
            notes.append("linkedin route available")

        capped_points = min(points, 25)
        if not notes:
            return 7, "limited contactability evidence"
        return capped_points, ", ".join(notes)

    def _parse_headcount(self, size: str) -> int | None:
        range_match = self._SIZE_RANGE_PATTERN.search(size)
        if range_match:
            low = int(range_match.group(1))
            high = int(range_match.group(2))
            return int((low + high) / 2)

        single_match = self._SIZE_SINGLE_PATTERN.search(size)
        if single_match:
            return int(single_match.group(1))

        return None

    def _normalize_stack(self, tech_stack: Any) -> set[str]:
        if isinstance(tech_stack, str):
            values = [tech_stack]
        elif isinstance(tech_stack, list):
            values = [str(item) for item in tech_stack]
        else:
            values = []

        return {value.lower().strip() for value in values if value and value.lower() != "unknown"}

    def _tier_for_score(self, score: int) -> str:
        if score >= 80:
            return "A"
        if score >= self.MIN_QUALIFIED_SCORE:
            return "B"
        return "C"
