from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


# Model: gemini-2.5-flash (speed-optimized)
class ScorerAgent:
    """Lead Scorer: ranks enriched leads against a 100-point qualification rubric."""

    name = "Lead Scorer"
    goal = "Score each enriched lead 1-100 based on budget signal, urgency, and fit"

    BASE_SCORE = 40
    MIN_QUALIFIED_SCORE = 60
    MIN_DISCARD_SCORE = 50

    _SIZE_RANGE_PATTERN = re.compile(r"(\d{1,4})\s*(?:-|to)\s*(\d{1,4})", re.IGNORECASE)
    _SIZE_SINGLE_PATTERN = re.compile(r"(\d{2,5})\+?")

    _DIRECT_PAIN_KEYWORDS = {
        "manual",
        "bottleneck",
        "struggle",
        "slow",
        "low conversion",
        "missed target",
        "urgent",
        "outsource",
    }
    _RELATED_PAIN_KEYWORDS = {
        "pipeline",
        "hiring",
        "scaling",
        "automation",
        "inefficient",
        "delays",
        "drop-off",
        "backlog",
    }
    _WEAK_PAIN_KEYWORDS = {
        "challenge",
        "help",
        "improve",
        "support",
        "optimize",
        "growth",
    }
    _NON_TARGET_COMPANY_DOMAINS = {
        "ycombinator.com",
        "glassdoor.com",
        "linkedin.com",
        "indeed.com",
        "naukri.com",
        "angel.co",
        "crunchbase.com",
        "techcrunch.com",
        "forbes.com",
        "inc.com",
        "facebook.com",
        "tracxn.com",
        "punestartups.org",
        "jobs.punestartups.org",
        "analyticsindiamag.com",
        "f6s.com",
        "wellfound.com",
        "unleashx.ai",
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
        "ycombinator.com",
        "glassdoor.com",
        "linkedin.com",
        "indeed.com",
    }
    _NON_COMPANY_WEBSITE_DOMAINS = _KNOWN_CONTENT_DOMAINS | _NON_TARGET_COMPANY_DOMAINS | {
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
        blocklisted, blocked_domain = self._is_non_target_blocklisted(lead)
        if blocklisted:
            scored = dict(lead)
            scored["score"] = 0
            scored["tier"] = "D"
            scored["qualified"] = False
            scored["discarded"] = True
            scored["discard"] = True
            scored["reasoning"] = (
                f"Discarded as non-target lead (blocklisted domain match: {blocked_domain})"
            )
            scored["score_breakdown"] = {
                "base_score": self.BASE_SCORE,
                "adjusted_score": 0,
                "discard_reason": f"blocklisted domain {blocked_domain}",
            }
            return scored

        company_points, company_note = self._score_company_size(str(lead.get("size", "")))
        pain_points, pain_note = self._score_pain_signal(lead)
        decision_maker_points, decision_maker_note = self._score_decision_maker_name(lead)
        linkedin_points, linkedin_note = self._score_linkedin_signal(lead)
        email_points, email_note = self._score_email_hint(lead)
        india_points, india_note = self._score_india_signal(lead)
        startup_points, startup_note = self._score_startup_recency(lead)
        website_points, website_note = self._score_website_signal(lead)
        blog_penalty, blog_note = self._score_blog_penalty(lead)
        content_penalty, content_note = self._score_content_domain_penalty(lead)

        score_delta = (
            company_points
            + pain_points
            + decision_maker_points
            + linkedin_points
            + email_points
            + india_points
            + startup_points
            + website_points
            + blog_penalty
            + content_penalty
        )

        adjusted_total = max(0, min(100, self.BASE_SCORE + score_delta))
        tier = self._tier_for_score(adjusted_total)
        discarded = adjusted_total < self.MIN_DISCARD_SCORE
        reasoning = (
            f"Base {self.BASE_SCORE}; "
            f"Company size {company_points:+d} ({company_note}); "
            f"Pain signal {pain_points:+d} ({pain_note}); "
            f"Decision maker {decision_maker_points:+d} ({decision_maker_note}); "
            f"LinkedIn {linkedin_points:+d} ({linkedin_note}); "
            f"Email hint {email_points:+d} ({email_note}); "
            f"India signal {india_points:+d} ({india_note or 'none'}); "
            f"Startup signal {startup_points:+d} ({startup_note or 'none'}); "
            f"Website signal {website_points:+d} ({website_note or 'none'}); "
            f"Blog/content penalty {blog_penalty:+d} ({blog_note or 'none'}); "
            f"Known content-site penalty {content_penalty:+d} ({content_note or 'none'})"
        )
        if discarded:
            reasoning += "; discarded after adjustments (<50)"

        scored = dict(lead)
        scored["score"] = int(adjusted_total)
        scored["tier"] = tier
        scored["qualified"] = (not discarded) and adjusted_total >= self.MIN_QUALIFIED_SCORE
        scored["discarded"] = discarded
        scored["discard"] = discarded
        scored["reasoning"] = reasoning
        scored["score_breakdown"] = {
            "base_score": self.BASE_SCORE,
            "company_size": company_points,
            "pain_signal_strength": pain_points,
            "decision_maker_name": decision_maker_points,
            "decision_maker_linkedin": linkedin_points,
            "email_hint": email_points,
            "india_signal": india_points,
            "startup_signal": startup_points,
            "website_signal": website_points,
            "blog_penalty": blog_penalty,
            "content_penalty": content_penalty,
            "net_adjustments": score_delta,
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
            return 0, "size unknown"

        headcount = self._parse_headcount(normalized_size)
        if headcount is None:
            return 0, "size present but unstructured"

        is_plus_range = "+" in normalized_size
        if 1 <= headcount <= 10:
            return 5, "1-10 employees"
        if 11 <= headcount <= 50:
            return 15, "11-50 employees"
        if 51 <= headcount <= 200 and not (is_plus_range and headcount >= 200):
            return 20, "51-200 employees"
        if headcount >= 200:
            return 10, "200+ employees"
        return 0, "size outside defined bands"

    def _score_pain_signal(self, lead: dict[str, Any]) -> tuple[int, str]:
        pain_text = str(lead.get("pain_point") or lead.get("pain_signal") or "")
        snippet_text = f"{pain_text} {self._combined_lead_text(lead)}".lower().strip()
        if not snippet_text:
            return 0, "no explicit pain signal"

        if any(keyword in snippet_text for keyword in self._DIRECT_PAIN_KEYWORDS):
            return 30, "direct pain keyword match"
        if any(keyword in snippet_text for keyword in self._RELATED_PAIN_KEYWORDS):
            return 15, "related pain keyword match"
        if any(keyword in snippet_text for keyword in self._WEAK_PAIN_KEYWORDS):
            return 5, "weak/indirect pain match"

        return 0, "no qualifying pain keyword match"

    def _score_decision_maker_name(self, lead: dict[str, Any]) -> tuple[int, str]:
        decision_maker = str(lead.get("decision_maker") or "").strip().lower()
        if not decision_maker or "unknown" in decision_maker:
            return 0, "decision maker unknown"
        return 15, "named decision maker found"

    def _score_email_hint(self, lead: dict[str, Any]) -> tuple[int, str]:
        email_hint = str(lead.get("email_hint") or lead.get("contact_hint") or "").strip().lower()
        email_confidence = str(lead.get("email_hint_confidence") or "").strip().lower()

        if not email_hint or email_hint == "unknown":
            return 0, "no email hint"

        if email_confidence == "found":
            return 10, "email hint found"
        if email_confidence == "guessed":
            return 5, "email hint guessed"
        if "@" in email_hint:
            return 10, "email hint found"

        return 0, "no email hint"

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
            return 10, "decision maker LinkedIn profile found"

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
            return -25, "blog/article/listicle signal"

        return 0, ""

    def _score_content_domain_penalty(self, lead: dict[str, Any]) -> tuple[int, str]:
        domain = self._extract_domain(lead)
        if any(domain.endswith(content_domain) for content_domain in self._KNOWN_CONTENT_DOMAINS):
            return -30, "known content-site domain"
        return 0, ""

    def _is_non_target_blocklisted(self, lead: dict[str, Any]) -> tuple[bool, str]:
        domain = self._extract_domain(lead)
        company_name = str(lead.get("company_name") or lead.get("company") or "").strip().lower()
        company_url = str(lead.get("url") or lead.get("website") or "").strip().lower()
        searchable_text = f"{company_name} {company_url}".strip()

        for blocked_domain in self._NON_TARGET_COMPANY_DOMAINS:
            if domain.endswith(blocked_domain):
                return True, blocked_domain
            if blocked_domain in searchable_text:
                return True, blocked_domain

        return False, ""

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
