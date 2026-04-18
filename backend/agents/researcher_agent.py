from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

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
        tavily_tool: TavilyTool | None = None,
        gemini_llm: Any | None = None,
    ) -> None:
        self.tavily_tool = tavily_tool or TavilyTool()
        self.gemini_llm = gemini_llm

    def enrich(self, lead: dict[str, Any]) -> dict[str, Any]:
        company_name = str(lead.get("company_name") or lead.get("company") or "Unknown Company")
        lead_url = str(lead.get("url") or lead.get("website") or "")
        company_site = self._resolve_company_site(company_name=company_name, fallback_url=lead_url)
        domain = self._extract_domain(company_site or lead_url)

        website_query = (
            f"site:{domain} {company_name} about team engineering technology stack customers"
            if domain
            else f"{company_name} company profile team products"
        )
        website_results = self.tavily_tool.search(query=website_query, max_results=5)

        linkedin_query = (
            f"site:linkedin.com {company_name} CEO OR Founder OR CTO OR VP Sales"
        )
        linkedin_results = self.tavily_tool.search(query=linkedin_query, max_results=5)

        activity_query = f"{company_name} funding launch hiring expansion partnership"
        activity_results = self.tavily_tool.search(query=activity_query, max_results=4)

        size = self._infer_company_size(website_results + linkedin_results + activity_results)
        tech_stack = self._infer_tech_stack(website_results + activity_results)
        pain_point = self._infer_pain_point(lead=lead, research_results=website_results + activity_results)
        decision_maker = self._infer_decision_maker(linkedin_results)
        email_hint = self._infer_email_hint(
            decision_maker=decision_maker,
            domain=domain,
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
                "email_hint": email_hint,
                "website": company_site or lead_url,
                "domain": domain,
                "recent_activity": self._recent_activity_summary(activity_results),
                "research": {
                    "website_results": website_results,
                    "linkedin_results": linkedin_results,
                    "activity_results": activity_results,
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

    def _infer_decision_maker(self, linkedin_results: list[dict[str, Any]]) -> str:
        for item in linkedin_results:
            text = f"{item.get('title', '')} {item.get('content', '')}".strip()
            match = self._DECISION_MAKER_PATTERN.search(text)
            if match:
                name = match.group(1).strip()
                role = match.group(2).strip()
                return f"{name} ({role})"

        for item in linkedin_results:
            url = str(item.get("url", "")).strip()
            if "linkedin.com/in/" in url:
                slug = url.split("linkedin.com/in/")[-1].split("/")[0]
                if slug:
                    inferred_name = slug.replace("-", " ").strip().title()
                    return f"{inferred_name} (LinkedIn profile)"

        return "Unknown"

    def _infer_email_hint(self, decision_maker: str, domain: str, contact_hint: str) -> str:
        if "@" in contact_hint:
            return contact_hint

        if not domain or decision_maker.lower() == "unknown":
            return "Unknown"

        raw_name = decision_maker.split("(")[0].strip()
        name_parts = [part.lower() for part in raw_name.split() if part]
        if len(name_parts) >= 2:
            return f"Likely pattern: {name_parts[0]}.{name_parts[-1]}@{domain}"
        if len(name_parts) == 1:
            return f"Likely pattern: {name_parts[0]}@{domain}"

        return "Unknown"

    def _extract_domain(self, url: str) -> str:
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "")

    def _recent_activity_summary(self, results: list[dict[str, Any]]) -> str:
        if not results:
            return "No notable recent public activity found"

        snippets = [str(item.get("title", "")).strip() for item in results if item.get("title")]
        if not snippets:
            return "No notable recent public activity found"

        return " | ".join(snippets[:2])
