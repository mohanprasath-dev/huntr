from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class ScorerAgent:
    """Lead Scorer: ranks enriched leads against a 100-point qualification rubric."""

    name = "Lead Scorer"
    goal = "Score each enriched lead 1-100 based on budget signal, urgency, and fit"

    MIN_QUALIFIED_SCORE = 60
    MIN_DISCARD_SCORE = 50

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
    _INDIA_LOCATION_KEYWORDS = {
        "india",
        "indian",
        "bengaluru",
        "bangalore",
        "mumbai",
        "new delhi",
        "delhi",
        "gurgaon",
        "gurugram",
        "pune",
        "hyderabad",
        "noida",
        "chennai",
        "ahmedabad",
    }
    _FOUNDING_YEAR_PATTERN = re.compile(
        r"\b(?:founded|established|started|launched|since)\s*(?:in\s*)?(19\d{2}|20\d{2})\b",
        re.IGNORECASE,
    )
    _LISTICLE_TITLE_PATTERN = re.compile(r"^\s*\d+[\).:\-\s]")
    _BLOG_PATH_PATTERN = re.compile(r"/(?:blog|article|post|news)/", re.IGNORECASE)
    _CONTENT_KEYWORD_PATTERN = re.compile(r"\b(?:how to|best|top|why)\b", re.IGNORECASE)
    _KNOWN_CONTENT_DOMAINS = {
        "medium.com",
        "substack.com",
        "hubspot.com",
        "blogspot.com",
        "wordpress.com",
        "towardsdatascience.com",
        "dev.to",
        "youtube.com",
    }
    _NON_COMPANY_WEBSITE_DOMAINS = _KNOWN_CONTENT_DOMAINS | {
        "linkedin.com",
        "facebook.com",
        "instagram.com",
        "reddit.com",
        "x.com",
        "twitter.com",
    }
    _PARKED_DOMAIN_MARKERS = (
        "domain is for sale",
        "this domain is for sale",
        "buy this domain",
        "parked free",
        "parked domain",
        "godaddy",
        "sedo",
        "afternic",
    )

    def __init__(
        self,
        gemini_llm: Any | None = None,
    ) -> None:
        self.gemini_llm = gemini_llm
        self._website_status_cache: dict[str, bool] = {}

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

        base_total = company_points + pain_points + tech_points + reach_points

        adjustment_points = 0
        adjustment_notes: list[str] = []

        india_bonus, india_note = self._score_india_signal(lead)
        if india_bonus:
            adjustment_points += india_bonus
            adjustment_notes.append(india_note)

        startup_bonus, startup_note = self._score_startup_recency(lead)
        if startup_bonus:
            adjustment_points += startup_bonus
            adjustment_notes.append(startup_note)

        linkedin_bonus, linkedin_note = self._score_linkedin_signal(lead)
        if linkedin_bonus:
            adjustment_points += linkedin_bonus
            adjustment_notes.append(linkedin_note)

        website_bonus, website_note = self._score_website_signal(lead)
        if website_bonus:
            adjustment_points += website_bonus
            adjustment_notes.append(website_note)

        blog_penalty, blog_note = self._score_blog_penalty(lead)
        if blog_penalty:
            adjustment_points += blog_penalty
            adjustment_notes.append(blog_note)

        content_penalty, content_note = self._score_content_domain_penalty(lead)
        if content_penalty:
            adjustment_points += content_penalty
            adjustment_notes.append(content_note)

        adjusted_total = max(0, min(100, base_total + adjustment_points))
        tier = self._tier_for_score(adjusted_total)
        discarded = adjusted_total < self.MIN_DISCARD_SCORE
        reasoning = (
            f"Company size {company_points}/20 ({company_note}); "
            f"Pain signal {pain_points}/30 ({pain_note}); "
            f"Tech maturity {tech_points}/25 ({tech_note}); "
            f"Decision-maker reachability {reach_points}/25 ({reach_note}); "
            f"India adjustments {adjustment_points:+d}"
        )
        if adjustment_notes:
            reasoning += f" ({'; '.join(adjustment_notes)})"
        if discarded:
            reasoning += "; discarded after adjustments (<50)"

        scored = dict(lead)
        scored["score"] = int(adjusted_total)
        scored["tier"] = tier
        scored["qualified"] = (not discarded) and adjusted_total >= self.MIN_QUALIFIED_SCORE
        scored["discarded"] = discarded
        scored["reasoning"] = reasoning
        scored["score_breakdown"] = {
            "company_size": company_points,
            "pain_signal_strength": pain_points,
            "tech_maturity": tech_points,
            "decision_maker_reachability": reach_points,
            "india_adjustments": adjustment_points,
            "base_score": base_total,
            "adjusted_score": int(adjusted_total),
        }
        return scored

    def rank_leads(self, enriched_leads: list[dict[str, Any]], top_k: int = 10) -> list[dict[str, Any]]:
        scored = [self.score(lead) for lead in enriched_leads]
        qualified = [
            lead
            for lead in scored
            if not bool(lead.get("discarded", False))
            and lead.get("score", 0) >= self.MIN_QUALIFIED_SCORE
        ]
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
        if score >= self.MIN_DISCARD_SCORE:
            return "C"
        return "D"

    def _score_india_signal(self, lead: dict[str, Any]) -> tuple[int, str]:
        domain = self._extract_domain(lead)
        if domain.endswith(".in"):
            return 10, "India company signal from .in domain"

        snippet_text = self._combined_lead_text(lead)
        if any(keyword in snippet_text for keyword in self._INDIA_LOCATION_KEYWORDS):
            return 10, "India location signal found in snippets"

        return 0, ""

    def _score_startup_recency(self, lead: dict[str, Any]) -> tuple[int, str]:
        text = self._combined_lead_text(lead)
        match = self._FOUNDING_YEAR_PATTERN.search(text)
        if not match:
            return 0, ""

        founding_year = int(match.group(1))
        current_year = datetime.now(timezone.utc).year
        company_age = current_year - founding_year
        if 0 <= company_age < 5:
            return 10, f"startup recency signal (founded {founding_year})"

        return 0, ""

    def _score_linkedin_signal(self, lead: dict[str, Any]) -> tuple[int, str]:
        linkedin_url = str(lead.get("linkedin_url") or "").strip().lower()
        if "linkedin.com/in/" in linkedin_url:
            return 5, "decision maker LinkedIn profile found"

        decision_maker = str(lead.get("decision_maker") or "").strip().lower()
        if "linkedin" in decision_maker:
            return 5, "decision maker LinkedIn route found"

        return 0, ""

    def _score_website_signal(self, lead: dict[str, Any]) -> tuple[int, str]:
        website = str(lead.get("website") or "").strip()
        domain = self._extract_domain(lead)
        if not website and not domain:
            return 0, ""

        if any(domain.endswith(blocked_domain) for blocked_domain in self._NON_COMPANY_WEBSITE_DOMAINS):
            return 0, ""

        website_url = website or f"https://{domain}"
        if website_url and "://" not in website_url:
            website_url = f"https://{website_url}"
        if self._website_loads(website_url):
            return 5, "company website reachable"

        return 0, ""

    def _score_blog_penalty(self, lead: dict[str, Any]) -> tuple[int, str]:
        title = self._candidate_title(lead)
        url = str(lead.get("url") or lead.get("website") or "").strip().lower()

        is_listicle_title = bool(title and self._LISTICLE_TITLE_PATTERN.search(title))
        has_content_words = bool(title and self._CONTENT_KEYWORD_PATTERN.search(title))
        is_blog_path = bool(url and self._BLOG_PATH_PATTERN.search(url))

        if is_listicle_title or has_content_words or is_blog_path:
            return -20, "blog/article/listicle signal"

        return 0, ""

    def _score_content_domain_penalty(self, lead: dict[str, Any]) -> tuple[int, str]:
        domain = self._extract_domain(lead)
        if any(domain.endswith(content_domain) for content_domain in self._KNOWN_CONTENT_DOMAINS):
            return -20, "known content-site domain"
        return 0, ""

    def _extract_domain(self, lead: dict[str, Any]) -> str:
        domain = str(lead.get("domain") or "").strip().lower()
        if domain:
            return domain.replace("www.", "").split(":")[0]

        url = str(lead.get("website") or lead.get("url") or "").strip()
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "").split(":")[0]

    def _candidate_title(self, lead: dict[str, Any]) -> str:
        title = str(lead.get("title") or "").strip().lower()
        if title:
            return title

        research = lead.get("research") if isinstance(lead.get("research"), dict) else {}
        for key in ("website_results", "activity_results", "linkedin_results"):
            items = research.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                candidate_title = str(item.get("title") or "").strip().lower()
                if candidate_title:
                    return candidate_title

        return ""

    def _combined_lead_text(self, lead: dict[str, Any]) -> str:
        chunks = [
            str(lead.get("pain_signal") or ""),
            str(lead.get("pain_point") or ""),
            str(lead.get("recent_activity") or ""),
            str(lead.get("reasoning") or ""),
        ]

        research = lead.get("research") if isinstance(lead.get("research"), dict) else {}
        for key in ("website_results", "activity_results", "linkedin_results"):
            items = research.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                chunks.append(str(item.get("title") or ""))
                chunks.append(str(item.get("content") or item.get("snippet") or ""))

        combined = " ".join(chunk for chunk in chunks if chunk).lower()
        return re.sub(r"\s+", " ", combined).strip()

    def _website_loads(self, url: str) -> bool:
        cached = self._website_status_cache.get(url)
        if cached is not None:
            return cached

        request = Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 HuntRScorer/1.0"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=4.0) as response:
                status = int(getattr(response, "status", 0) or 0)
                if status >= 400:
                    self._website_status_cache[url] = False
                    return False

                page_sample = response.read(4096).decode("utf-8", errors="ignore").lower()
                if any(marker in page_sample for marker in self._PARKED_DOMAIN_MARKERS):
                    self._website_status_cache[url] = False
                    return False

                self._website_status_cache[url] = True
                return True
        except (HTTPError, URLError, ValueError, TimeoutError):
            self._website_status_cache[url] = False
            return False
