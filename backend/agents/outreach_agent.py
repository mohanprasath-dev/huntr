from __future__ import annotations

import json
import os
import re
from typing import Any

try:
    from google import genai
    from google.genai.types import GenerateContentConfig
except Exception:  # pragma: no cover - optional dependency at scaffold time
    genai = None
    GenerateContentConfig = None


class OutreachAgent:
    """Builds personalized outreach copy using Gemini on Vertex AI."""

    name = "Outreach Specialist"
    goal = (
        "Generate highly personalized founder-style outbound messages from enriched, scored leads"
    )

    _MAX_LINKEDIN_CHARS = 300
    _GENERIC_PHRASES = (
        "i hope this email finds you well",
        "just checking in",
        "to whom it may concern",
        "dear sir or madam",
        "dear team",
        "we help businesses",
    )

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
        context = self._build_context(lead)
        prompt = self._build_prompt(context)
        generated_text = self._generate_with_gemini(prompt)
        parsed = self._parse_generated_payload(generated_text)
        payload = self._build_payload(context=context, generated=parsed)
        payload.update(self._build_confirmation_payload(context=context, lead=lead))

        enriched = dict(lead)
        enriched.update(payload)
        return enriched

    def send_email_if_confirmed(
        self,
        lead: dict[str, Any],
        email_tool: Any,
        to_email: str,
        from_name: str,
        from_email: str,
        confirmed: bool = False,
    ) -> dict[str, Any]:
        if not confirmed:
            return {
                "status": "awaiting_confirmation",
                "detail": "User confirmation required before sending outreach email.",
            }

        subject = str(lead.get("email_subject") or "").strip()
        body = str(lead.get("email_body") or "").strip()
        if not subject or not body:
            return {
                "status": "failed",
                "detail": "Missing generated email subject or body.",
            }

        return email_tool.send_email(
            to=to_email,
            subject=subject,
            body=body,
            from_name=from_name,
            from_email=from_email,
        )

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

    def _build_prompt(self, context: dict[str, str]) -> str:
        lead_payload = json.dumps(
            {
                "company_name": context["company_name"],
                "website": context["website"],
                "domain": context["domain"],
                "pain_point": context["pain_point"],
                "recent_activity": context["recent_activity"],
                "decision_maker": context["decision_maker"],
                "tech_stack": context["tech_stack"],
                "size": context["size"],
                "score": context["score"],
                "tier": context["tier"],
                "sender_name": context["sender_name"],
                "sender_company": context["sender_company"],
                "sender_service": context["sender_service"],
            },
            ensure_ascii=True,
        )

        return (
            "You are Outreach Specialist, writing founder-to-founder outreach.\n"
            "Generate outreach for exactly one lead using only the lead facts.\n"
            "Hard requirements:\n"
            "1) Cold email subject must reference the lead's specific pain point.\n"
            "2) Cold email opening line must mention something specific about the company.\n"
            "3) Cold email body has exactly three sentences after the opening line: problem, solution, CTA.\n"
            "4) Include a signature block with sender_name and sender_company.\n"
            "5) LinkedIn message must be <= 300 characters and natural.\n"
            "6) If recent_activity is available, LinkedIn message must reference that specific activity/post.\n"
            "7) Never use generic templates or placeholders. Every message must reference company-specific data.\n"
            "8) Tone is direct, human, non-salesy.\n"
            "Return strict JSON only (no markdown) with keys:\n"
            "email_subject, email_opening_line, email_problem_sentence, email_solution_sentence, email_cta_sentence, linkedin_message\n\n"
            f"Lead facts JSON:\n{lead_payload}"
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
                        temperature=0.35,
                        max_output_tokens=420,
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

    def _build_context(self, lead: dict[str, Any]) -> dict[str, str]:
        company_name = self._clean_detail(
            lead.get("company_name") or lead.get("company") or "Unknown Company"
        ) or "Unknown Company"
        website = self._clean_detail(lead.get("website") or lead.get("url"))
        domain = self._clean_detail(lead.get("domain"))
        pain_point = self._clean_detail(lead.get("pain_point") or lead.get("pain_signal"))
        if not pain_point:
            pain_point = "manual prospecting and inconsistent pipeline conversion"

        recent_activity = self._clean_detail(lead.get("recent_activity"))
        decision_maker = self._clean_detail(lead.get("decision_maker"))
        tech_stack = self._stringify_tech_stack(lead.get("tech_stack"))
        size = self._clean_detail(lead.get("size"))
        score = self._clean_detail(lead.get("score"))
        tier = self._clean_detail(lead.get("tier"))

        sender_name = self._clean_detail(lead.get("sender_name")) or "HuntR"
        sender_company = self._clean_detail(lead.get("sender_company")) or "HuntR"
        sender_service = (
            self._clean_detail(lead.get("sender_service")) or "B2B client acquisition"
        )

        decision_maker_name = self._extract_decision_maker_name(decision_maker)
        activity_snippet = self._activity_snippet(recent_activity)
        pain_focus = self._short_phrase(pain_point, max_words=8)

        return {
            "company_name": company_name,
            "website": website,
            "domain": domain,
            "pain_point": pain_point,
            "pain_focus": pain_focus,
            "recent_activity": recent_activity,
            "activity_snippet": activity_snippet,
            "decision_maker": decision_maker,
            "decision_maker_name": decision_maker_name,
            "tech_stack": tech_stack,
            "size": size,
            "score": score,
            "tier": tier,
            "sender_name": sender_name,
            "sender_company": sender_company,
            "sender_service": sender_service,
        }

    def _parse_generated_payload(self, generated_text: str) -> dict[str, str]:
        if not generated_text.strip():
            return {}

        cleaned = generated_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        parsed: Any = None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}", cleaned)
            if match:
                try:
                    parsed = json.loads(match.group(0))
                except json.JSONDecodeError:
                    parsed = None

        if not isinstance(parsed, dict):
            return {}

        return {
            "email_subject": self._clean_line(parsed.get("email_subject", "")),
            "email_opening_line": self._clean_line(parsed.get("email_opening_line", "")),
            "email_problem_sentence": self._clean_line(
                parsed.get("email_problem_sentence", "")
            ),
            "email_solution_sentence": self._clean_line(
                parsed.get("email_solution_sentence", "")
            ),
            "email_cta_sentence": self._clean_line(parsed.get("email_cta_sentence", "")),
            "linkedin_message": self._clean_line(parsed.get("linkedin_message", "")),
        }

    def _build_payload(
        self,
        context: dict[str, str],
        generated: dict[str, str],
    ) -> dict[str, str]:
        subject = generated.get("email_subject", "")
        opening = generated.get("email_opening_line", "")
        problem = self._ensure_sentence(generated.get("email_problem_sentence", ""))
        solution = self._ensure_sentence(generated.get("email_solution_sentence", ""))
        cta = self._ensure_sentence(generated.get("email_cta_sentence", ""))
        linkedin_message = generated.get("linkedin_message", "")

        if not self._subject_references_pain(subject, context):
            subject = self._fallback_subject(context)
        if not self._contains_company_specific_reference(opening, context):
            opening = self._fallback_opening_line(context)
        if not self._sentence_mentions_pain(problem, context):
            problem = self._fallback_problem_sentence(context)
        if self._is_generic_sentence(solution):
            solution = self._fallback_solution_sentence(context)
        if self._is_generic_sentence(cta):
            cta = self._fallback_cta_sentence()

        email_body = self._compose_email_body(
            context=context,
            opening=opening,
            problem=problem,
            solution=solution,
            cta=cta,
        )

        linkedin_message = self._normalize_linkedin_message(linkedin_message, context)
        if not linkedin_message:
            linkedin_message = self._fallback_linkedin_message(context)

        return {
            "email_subject": subject,
            "email_body": email_body,
            "linkedin_message": linkedin_message,
        }

    def _fallback_subject(self, context: dict[str, str]) -> str:
        return f"{context['company_name']}: fixing {context['pain_focus']}"

    def _fallback_opening_line(self, context: dict[str, str]) -> str:
        if context["activity_snippet"]:
            return (
                f"I saw {context['company_name']}'s recent update about "
                f"{context['activity_snippet']} and wanted to reach out directly."
            )

        if context["tech_stack"]:
            return (
                f"I noticed {context['company_name']} is operating with {context['tech_stack']} "
                "while scaling growth."
            )

        if context["website"]:
            return f"I spent a few minutes on {context['website']} and saw what {context['company_name']} is building."

        return f"I have been following {context['company_name']} and your current growth motion."

    def _fallback_problem_sentence(self, context: dict[str, str]) -> str:
        return self._ensure_sentence(
            f"It looks like {context['pain_focus']} is creating drag on pipeline consistency"
        )

    def _fallback_solution_sentence(self, context: dict[str, str]) -> str:
        return self._ensure_sentence(
            f"We help founders at teams like {context['company_name']} use {context['sender_service']} "
            "to turn that into steady qualified conversations"
        )

    def _fallback_cta_sentence(self) -> str:
        return "Open to a 15-minute founder-to-founder chat next week?"

    def _compose_email_body(
        self,
        context: dict[str, str],
        opening: str,
        problem: str,
        solution: str,
        cta: str,
    ) -> str:
        recipient = context["decision_maker_name"] or "there"
        sender_name = context["sender_name"]
        sender_company = context["sender_company"]

        return (
            f"Hi {recipient},\n\n"
            f"{self._ensure_sentence(opening)}\n"
            f"{problem}\n"
            f"{solution}\n"
            f"{self._ensure_sentence(cta)}\n\n"
            f"Best,\n{sender_name}\n{sender_company}"
        )

    def _normalize_linkedin_message(self, message: str, context: dict[str, str]) -> str:
        cleaned = self._clean_line(message)
        if not cleaned:
            return ""

        if not self._contains_company_specific_reference(cleaned, context):
            return ""

        if context["activity_snippet"] and not self._has_keyword_overlap(
            cleaned,
            context["activity_snippet"],
        ):
            return ""

        return self._fit_linkedin_limit(cleaned)

    def _fallback_linkedin_message(self, context: dict[str, str]) -> str:
        first_name = context["decision_maker_name"] or "there"
        company = context["company_name"]
        pain = context["pain_focus"]
        service = context["sender_service"]

        if context["activity_snippet"]:
            message = (
                f"Hi {first_name}, saw {company}'s recent post on {context['activity_snippet']}. "
                f"I work with founders solving {pain} through {service}. Open to connect?"
            )
        else:
            message = (
                f"Hi {first_name}, noticed {company} is navigating {pain}. "
                f"I help founders fix this with focused {service}. Open to connect?"
            )

        return self._fit_linkedin_limit(message)

    def _subject_references_pain(self, subject: str, context: dict[str, str]) -> bool:
        if not subject:
            return False
        if self._is_generic_sentence(subject):
            return False
        return self._has_keyword_overlap(subject, context["pain_focus"])

    def _sentence_mentions_pain(self, sentence: str, context: dict[str, str]) -> bool:
        if not sentence:
            return False
        return self._has_keyword_overlap(sentence, context["pain_focus"])

    def _contains_company_specific_reference(self, text: str, context: dict[str, str]) -> bool:
        if not text:
            return False

        lowered = text.lower()
        direct_refs = (
            context["company_name"],
            context["domain"],
            context["decision_maker_name"],
            context["website"],
        )
        for ref in direct_refs:
            if ref and ref.lower() in lowered:
                return True

        inferred_refs = (
            context["pain_focus"],
            context["activity_snippet"],
            context["tech_stack"],
        )
        for ref in inferred_refs:
            if ref and self._has_keyword_overlap(text, ref):
                return True

        return False

    def _is_generic_sentence(self, text: str) -> bool:
        lowered = text.lower().strip()
        if not lowered:
            return True
        return any(phrase in lowered for phrase in self._GENERIC_PHRASES)

    def _clean_detail(self, value: Any) -> str:
        text = str(value).strip() if value is not None else ""
        lowered = text.lower()
        if lowered in {
            "",
            "unknown",
            "no direct contact found",
            "no explicit pain point found",
            "no notable recent public activity found",
        }:
            return ""
        return text

    def _stringify_tech_stack(self, tech_stack: Any) -> str:
        if isinstance(tech_stack, list):
            values = [str(item).strip() for item in tech_stack if str(item).strip()]
            cleaned = [value for value in values if value.lower() != "unknown"]
            return ", ".join(cleaned[:4])
        if isinstance(tech_stack, str) and tech_stack.strip() and tech_stack.lower() != "unknown":
            return tech_stack.strip()
        return ""

    def _extract_decision_maker_name(self, decision_maker: str) -> str:
        if not decision_maker:
            return ""
        name = decision_maker.split("(", 1)[0].strip()
        if name.lower() == "unknown":
            return ""
        return name

    def _activity_snippet(self, recent_activity: str) -> str:
        if not recent_activity:
            return ""
        primary = recent_activity.split("|", 1)[0].strip()
        return self._short_phrase(primary, max_words=10)

    def _short_phrase(self, text: str, max_words: int) -> str:
        words = [word for word in text.split() if word]
        if len(words) <= max_words:
            return " ".join(words)
        return " ".join(words[:max_words])

    def _clean_line(self, value: Any) -> str:
        text = str(value or "").replace("\n", " ").strip()
        text = re.sub(r"\s+", " ", text)
        return text.strip(" \"'")

    def _ensure_sentence(self, text: str) -> str:
        cleaned = self._clean_line(text)
        if not cleaned:
            return ""
        if cleaned[-1] not in ".!?":
            return f"{cleaned}."
        return cleaned

    def _has_keyword_overlap(self, text: str, phrase: str) -> bool:
        if not text or not phrase:
            return False

        text_tokens = set(re.findall(r"[a-zA-Z]{4,}", text.lower()))
        phrase_tokens = set(re.findall(r"[a-zA-Z]{4,}", phrase.lower()))
        return bool(text_tokens.intersection(phrase_tokens))

    def _fit_linkedin_limit(self, message: str) -> str:
        compact = re.sub(r"\s+", " ", message).strip()
        if len(compact) <= self._MAX_LINKEDIN_CHARS:
            return compact
        trimmed = compact[: self._MAX_LINKEDIN_CHARS - 3].rstrip()
        return f"{trimmed}..."

    def _build_confirmation_payload(
        self,
        context: dict[str, str],
        lead: dict[str, Any],
    ) -> dict[str, Any]:
        recipient_hint = self._recipient_hint(lead)
        recipient_text = recipient_hint if recipient_hint else "the intended recipient"

        return {
            "email_send_requires_confirmation": True,
            "email_send_status": "awaiting_user_confirmation",
            "email_send_prompt": (
                f"Confirm before sending this email to {recipient_text} for {context['company_name']}."
            ),
            "email_send_recipient_hint": recipient_hint,
        }

    def _recipient_hint(self, lead: dict[str, Any]) -> str:
        email_hint = str(lead.get("email_hint") or lead.get("contact_hint") or "").strip()
        if "@" in email_hint:
            return email_hint
        return ""
