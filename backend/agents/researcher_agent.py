from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from tools.serper_tool import SerperTool
from tools.tavily_tool import TavilyTool


class ResearcherAgent:
    """Lead Researcher: deep enriches each company with buying context."""

    name = "Lead Researcher"
    goal = (
        "For each lead, deep research the company -- size, tech stack, recent activity, "
        "decision maker name"
    )

    _SIZE_PATTERN = re.compile(
        r"(\b\d{1,4}\s?(?:-|to)\s?\d{1,4}\b|\b\d{2,5}\+?\b)\s+employees",
        re.IGNORECASE,
    )
    _DECISION_MAKER_PATTERN = re.compile(
        r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*(?:,|\||-)\s*"
        r"(CEO|Founder|Co-Founder|CTO|CRO|CMO|Head of [A-Za-z ]+|VP [A-Za-z ]+)",
        re.IGNORECASE,
    )
    _PERSON_NAME_PATTERN = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b")
    _TITLE_PATTERN = re.compile(
        r"\b(CEO|Chief Executive Officer|Founder|Co-Founder|CTO|Chief Technology Officer)\b",
        re.IGNORECASE,
    )
    _EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    _NAME_STOPWORDS = {
        "linkedin",
        "profile",
        "founder",
        "co",
        "ceo",
        "cto",
        "chief",
        "executive",
        "officer",
        "technology",
        "contact",
        "email",
        "india",
        "company",
        "technologies",
        "solutions",
        "systems",
        "labs",
        "software",
        "services",
        "startup",
        "limited",
        "ltd",
        "inc",
        "private",
        "pvt",
    }
    _INVALID_DECISION_MAKER_NAME_TERMS = {
        "institute",
        "university",
        "college",
        "department",
        "foundation",
        "association",
        "committee",
        "school",
        "academy",
    }
    _TECH_KEYWORDS = {
        "python": "Python",
        "django": "Django",
        "fastapi": "FastAPI",
        "node": "Node.js",
        "react": "React",
        "next.js": "Next.js",
        "kubernetes": "Kubernetes",
        "docker": "Docker",
        "aws": "AWS",
        "gcp": "GCP",
        "azure": "Azure",
        "salesforce": "Salesforce",
        "hubspot": "HubSpot",
        "snowflake": "Snowflake",
        "postgres": "PostgreSQL",
    }
    _SOCIAL_DOMAINS = {
        "linkedin.com",
        "reddit.com",
        "x.com",
        "twitter.com",
        "facebook.com",
        "instagram.com",
        "youtube.com",
    }

    def __init__(
        self,
        serper_tool: SerperTool | None = None,
        tavily_tool: TavilyTool | None = None,
        gemini_llm: Any | None = None,
    ) -> None:
        self.serper_tool = serper_tool or SerperTool()
        self.tavily_tool = tavily_tool or TavilyTool()
        self.gemini_llm = gemini_llm

    def enrich(self, lead: dict[str, Any]) -> dict[str, Any]:
        company_name = str(lead.get("company_name") or lead.get("company") or "Unknown Company")
        lead_url = str(lead.get("url") or lead.get("website") or "")
        company_site = self._resolve_company_site(company_name=company_name, fallback_url=lead_url)
        domain = self._extract_domain(company_site or lead_url)
        company_domain = domain if domain and domain not in self._SOCIAL_DOMAINS else ""

        website_query = (
            f"site:{company_domain} {company_name} about team engineering technology stack customers"
            if company_domain
            else f"{company_name} company profile team products"
        )
        website_results = self.tavily_tool.search(query=website_query, max_results=5)

        linkedin_query = (
            f"site:linkedin.com {company_name} CEO OR Founder OR CTO OR VP Sales"
        )
        linkedin_results = self.tavily_tool.search(query=linkedin_query, max_results=5)

        activity_query = f"{company_name} funding launch hiring expansion partnership"
        activity_results = self.tavily_tool.search(query=activity_query, max_results=4)

        decision_profile = self._find_decision_maker_profile(
            company_name=company_name,
            domain=company_domain,
        )
        decision_maker_name = str(decision_profile.get("name", "")).strip()
        decision_maker_title = str(decision_profile.get("title", "")).strip()
        linkedin_url = str(decision_profile.get("url", "")).strip()

        size = self._infer_company_size(website_results + linkedin_results + activity_results)
        tech_stack = self._infer_tech_stack(website_results + activity_results)
        pain_point = self._infer_pain_point(lead=lead, research_results=website_results + activity_results)
        decision_maker = decision_maker_name or "Founder/CEO (name unknown)"
        if self._is_invalid_decision_maker_name(decision_maker):
            decision_maker = "Founder/CEO (name unknown)"
            linkedin_url = ""
        email_hint, email_hint_confidence, email_search_results = self._infer_email_hint(
            company_name=company_name,
            decision_maker_name=decision_maker_name,
            domain=company_domain,
            contact_hint=str(lead.get("contact_hint", "")),
        )

        enriched = dict(lead)
        enriched.update(
            {
                "company": company_name,
                "company_name": company_name,
                "size": size,
                "tech_stack": tech_stack,
                "pain_point": pain_point,
                "decision_maker": decision_maker,
                "decision_maker_title": decision_maker_title or "Unknown",
                "email_hint": email_hint,
                "email_hint_confidence": email_hint_confidence,
                "linkedin_url": linkedin_url,
                "website": company_site or lead_url,
                "domain": domain,
                "recent_activity": self._recent_activity_summary(activity_results),
                "research": {
                    "website_results": website_results,
                    "linkedin_results": linkedin_results,
                    "activity_results": activity_results,
                    "linkedin_profile_result": decision_profile,
                    "email_results": email_search_results,
                },
            }
        )
        return enriched

    def _resolve_company_site(self, company_name: str, fallback_url: str) -> str:
        fallback_domain = self._extract_domain(fallback_url)
        if fallback_url and fallback_domain and fallback_domain not in self._SOCIAL_DOMAINS:
            return fallback_url

        website_results = self.tavily_tool.search(
            query=f"{company_name} official website",
            max_results=4,
        )
        for item in website_results:
            candidate_url = str(item.get("url", "")).strip()
            domain = self._extract_domain(candidate_url)
            if domain and domain not in self._SOCIAL_DOMAINS:
                return candidate_url

        return fallback_url

    def _infer_company_size(self, results: list[dict[str, Any]]) -> str:
        combined_text = " ".join(
            f"{item.get('title', '')} {item.get('content', '')}".strip() for item in results
        )
        match = self._SIZE_PATTERN.search(combined_text)
        if match:
            size_token = match.group(1).replace("to", "-").replace(" ", "")
            return f"{size_token} employees"

        return "Unknown"

    def _infer_tech_stack(self, results: list[dict[str, Any]]) -> list[str]:
        combined_text = " ".join(
            f"{item.get('title', '')} {item.get('content', '')}".lower().strip() for item in results
        )

        stack: list[str] = []
        for needle, normalized in self._TECH_KEYWORDS.items():
            if needle in combined_text and normalized not in stack:
                stack.append(normalized)

        if stack:
            return stack[:8]
        return ["Unknown"]

    def _infer_pain_point(
        self,
        lead: dict[str, Any],
        research_results: list[dict[str, Any]],
    ) -> str:
        lead_signal = str(lead.get("pain_signal") or "").strip()
        if lead_signal:
            return lead_signal[:240]

        pain_markers = (
            "manual",
            "slow",
            "challenge",
            "bottleneck",
            "struggle",
            "pipeline",
            "conversion",
            "hiring",
        )
        for item in research_results:
            content = str(item.get("content", "")).strip()
            lowered = content.lower()
            if any(marker in lowered for marker in pain_markers):
                return content[:240]

        return "No explicit pain point found"

    def _find_decision_maker_profile(self, company_name: str, domain: str) -> dict[str, str]:
        if not domain:
            return {"name": "", "title": "", "url": ""}

        query = f"site:linkedin.com/in {company_name} founder OR CEO OR CTO"
        results = self.serper_tool.search(query=query, num_results=5)
        if not results:
            return {"name": "", "title": "", "url": ""}

        top_result = results[0] if isinstance(results[0], dict) else {}
        raw_title = str(top_result.get("title", "")).strip()
        raw_snippet = str(top_result.get("snippet", "")).strip()
        raw_url = str(top_result.get("link", "")).strip()

        name = self._extract_person_name(snippet=raw_snippet, title=raw_title)
        title = self._extract_decision_maker_title(raw_title=raw_title, raw_snippet=raw_snippet)

        linkedin_url = ""
        if "linkedin.com/in/" in raw_url:
            linkedin_url = raw_url

        return {
            "name": name,
            "title": title,
            "url": linkedin_url,
            "source_title": raw_title,
        }

    def _infer_email_hint(
        self,
        company_name: str,
        decision_maker_name: str,
        domain: str,
        contact_hint: str,
    ) -> tuple[str, str, list[dict[str, Any]]]:
        contact_email = self._extract_email(contact_hint)
        if contact_email:
            return contact_email, "found", []

        email_query = f"{company_name} founder email contact"
        email_results = self.serper_tool.search(query=email_query, num_results=5)
        for item in email_results:
            title = str(item.get("title", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            link = str(item.get("link", "")).strip()
            discovered_email = self._extract_email(f"{title} {snippet} {link}")
            if discovered_email:
                return discovered_email, "found", email_results

        guessed_email = self._guess_email(decision_maker_name=decision_maker_name, domain=domain)
        if guessed_email:
            return guessed_email, "guessed", email_results

        return "Unknown", "guessed", email_results

    def _extract_person_name(self, snippet: str, title: str) -> str:
        for text in (snippet, title):
            for candidate in self._PERSON_NAME_PATTERN.findall(text):
                normalized = " ".join(candidate.split()).strip()
                lowered_tokens = {token.lower() for token in normalized.split()}
                if lowered_tokens & self._NAME_STOPWORDS:
                    continue
                if len(normalized.split()) < 2:
                    continue
                return normalized
        return ""

    def _extract_decision_maker_title(self, raw_title: str, raw_snippet: str) -> str:
        text = f"{raw_title} {raw_snippet}"
        match = self._TITLE_PATTERN.search(text)
        if not match:
            return ""

        raw_role = match.group(1).strip().lower()
        role_map = {
            "ceo": "CEO",
            "chief executive officer": "CEO",
            "founder": "Founder",
            "co-founder": "Co-Founder",
            "cto": "CTO",
            "chief technology officer": "CTO",
        }
        return role_map.get(raw_role, match.group(1).strip())

    def _is_invalid_decision_maker_name(self, decision_maker: str) -> bool:
        normalized = decision_maker.lower().strip()
        if not normalized:
            return False
        return any(term in normalized for term in self._INVALID_DECISION_MAKER_NAME_TERMS)

    def _extract_email(self, text: str) -> str:
        match = self._EMAIL_PATTERN.search(text)
        if not match:
            return ""
        return match.group(0).strip().lower()

    def _guess_email(self, decision_maker_name: str, domain: str) -> str:
        if not domain or not decision_maker_name:
            return ""

        name_parts = [re.sub(r"[^A-Za-z]", "", token).lower() for token in decision_maker_name.split()]
        name_parts = [token for token in name_parts if token]
        if not name_parts:
            return ""

        first_name = name_parts[0]
        last_name = name_parts[-1] if len(name_parts) >= 2 else ""

        candidates = [f"{first_name}@{domain}"]
        if last_name:
            candidates.append(f"{first_name}.{last_name}@{domain}")
            candidates.append(f"{'.'.join(name_parts)}@{domain}")

        seen_candidates: set[str] = set()
        deduped_candidates: list[str] = []
        for candidate in candidates:
            if candidate in seen_candidates:
                continue
            seen_candidates.add(candidate)
            deduped_candidates.append(candidate)

        return deduped_candidates[0] if deduped_candidates else ""

    def _extract_domain(self, url: str) -> str:
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "").split(":")[0]

    def _recent_activity_summary(self, results: list[dict[str, Any]]) -> str:
        if not results:
            return "No notable recent public activity found"

        snippets = [str(item.get("title", "")).strip() for item in results if item.get("title")]
        if not snippets:
            return "No notable recent public activity found"

        return " | ".join(snippets[:2])
