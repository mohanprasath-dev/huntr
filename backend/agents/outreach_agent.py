from __future__ import annotations

import os
from typing import Any

try:
    from google import genai
    from google.genai.types import GenerateContentConfig
except Exception:  # pragma: no cover - optional dependency at scaffold time
    genai = None
    GenerateContentConfig = None


class OutreachAgent:
    """Builds personalized outreach copy using Gemini on Vertex AI."""

    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        gemini_llm: Any | None = None,
    ) -> None:
        self.model = model
        self.gemini_llm = gemini_llm
        self.project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
        self.location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        self.client = self._build_client()

    def draft_outreach(self, lead: dict[str, Any]) -> dict[str, Any]:
        prompt = self._build_prompt(lead)
        generated = self._generate_with_gemini(prompt)
        email_text = generated if generated else self._fallback_email(lead)

        enriched = dict(lead)
        enriched["outreach_email"] = email_text
        return enriched

    def _build_client(self):
        if genai is None or not self.project:
            return None

        try:
            return genai.Client(
                vertexai=True,
                project=self.project,
                location=self.location,
            )
        except Exception:
            return None

    def _build_prompt(self, lead: dict[str, Any]) -> str:
        return (
            "You are HuntR, an autonomous B2B client acquisition assistant. "
            "Write a concise cold email with a personalized hook, one clear value proposition, "
            "and a single CTA for a 15-minute call.\n\n"
            f"Lead company: {lead.get('company_name', 'Unknown')}\n"
            f"Website: {lead.get('website', 'Unknown')}\n"
            f"Fit notes: {lead.get('fit_notes', 'No fit notes available')}\n"
            f"Priority tier: {lead.get('tier', 'C')}\n"
            "Tone: direct, helpful, non-pushy."
        )

    def _generate_with_gemini(self, prompt: str) -> str:
        if self.client is None:
            return ""

        try:
            if GenerateContentConfig is not None:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=GenerateContentConfig(
                        temperature=0.3,
                        max_output_tokens=260,
                    ),
                )
            else:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                )
        except Exception:
            return ""

        text = getattr(response, "text", "")
        if isinstance(text, str) and text.strip():
            return text.strip()

        candidates = getattr(response, "candidates", [])
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", []) if content else []
            for part in parts:
                part_text = getattr(part, "text", "")
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()

        return ""

    def _fallback_email(self, lead: dict[str, Any]) -> str:
        company = lead.get("company_name", "your team")
        return (
            f"Subject: Quick idea for {company}\n\n"
            f"Hi there,\n\n"
            f"I noticed {company} is actively growing and thought a quick note might be useful. "
            f"HuntR helps B2B teams identify high-intent prospects and run personalized outreach "
            f"without manual list building.\n\n"
            "If helpful, I can share a 15-minute walkthrough tailored to your acquisition goals.\n\n"
            "Best,\nHuntR"
        )
