from __future__ import annotations

from typing import Any


class FollowupAgent:
    """Creates a multi-step follow-up plan for each qualified lead."""

    def build_sequence(self, lead: dict[str, Any], steps: int = 3) -> dict[str, Any]:
        company = lead.get("company_name", "the team")
        sequence = []

        for index in range(steps):
            day_offset = (index + 1) * 3
            sequence.append(
                {
                    "day": day_offset,
                    "subject": f"Follow-up {index + 1}: quick idea for {company}",
                    "message": (
                        f"Hi again, sharing one additional idea we can apply for {company} to "
                        "increase qualified outbound conversations this quarter."
                    ),
                }
            )

        enriched = dict(lead)
        enriched["followup_sequence"] = sequence
        return enriched
