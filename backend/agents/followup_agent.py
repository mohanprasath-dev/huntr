from __future__ import annotations

from typing import Any


# Model: gemini-2.5-flash (speed-optimized)
class FollowupAgent:
    """Creates a multi-step follow-up plan for each qualified lead."""

    name = "Follow-up Specialist"
    goal = "Create human follow-up emails for Day 3, Day 7, and Day 14 with a graceful close"
    _FOLLOWUP_DAYS = (3, 7, 14)

    def __init__(self, gemini_llm: Any | None = None) -> None:
        self.gemini_llm = gemini_llm

    def build_sequence(self, lead: dict[str, Any], steps: int = 3) -> dict[str, Any]:
        if str(lead.get("outreach_status") or "").strip().lower() == "needs_review":
            enriched = dict(lead)
            enriched["followup_sequence"] = []
            return enriched

        company = str(lead.get("company_name") or lead.get("company") or "your team")
        pain_point = str(
            lead.get("pain_point")
            or lead.get("pain_signal")
            or "inconsistent qualified pipeline"
        )
        sender_name = str(lead.get("sender_name") or "HuntR")
        sender_company = str(lead.get("sender_company") or "HuntR")
        contact_name = self._extract_contact_name(str(lead.get("decision_maker") or ""))
        subject_seed = str(lead.get("email_subject") or f"Quick idea for {company}").strip()

        opening = f"Hi {contact_name},"
        day3_message = (
            f"{opening}\n\n"
            f"Following up on my earlier note about {pain_point} at {company}. "
            "I can send over a short, concrete plan tailored to your current motion if helpful.\n\n"
            f"Best,\n{sender_name}\n{sender_company}"
        )
        day7_message = (
            f"{opening}\n\n"
            "Circling back on my previous follow-up where I offered a short plan. "
            f"If {pain_point} is still on your plate at {company}, I can share it in one concise note.\n\n"
            f"Best,\n{sender_name}\n{sender_company}"
        )
        day14_message = (
            f"{opening}\n\n"
            "Closing the loop on my two earlier messages so I do not clutter your inbox. "
            f"If solving {pain_point} becomes a priority for {company}, reply with "
            '"revisit" and I will share the playbook.\n\n'
            f"Best,\n{sender_name}\n{sender_company}"
        )

        sequence = [
            {
                "day": self._FOLLOWUP_DAYS[0],
                "subject": f"Re: {subject_seed}",
                "message": day3_message,
            },
            {
                "day": self._FOLLOWUP_DAYS[1],
                "subject": f"Quick follow-up on my last note for {company}",
                "message": day7_message,
            },
            {
                "day": self._FOLLOWUP_DAYS[2],
                "subject": f"Closing the loop for now - {company}",
                "message": day14_message,
                "type": "breakup",
            },
        ]

        enriched = dict(lead)
        enriched["followup_sequence"] = sequence[: max(1, min(steps, len(sequence)))]
        return enriched

    def _extract_contact_name(self, decision_maker: str) -> str:
        if not decision_maker:
            return "there"

        name = decision_maker.split("(", 1)[0].strip()
        if not name or name.lower() == "unknown":
            return "there"

        return name
