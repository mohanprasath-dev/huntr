from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

import requests

from tools.linkedin_tool import LinkedInTool


class ResearcherAgent:
    """Enriches lead records with market and company context."""

    TAVILY_URL = "https://api.tavily.com/search"

    def __init__(self, linkedin_tool: LinkedInTool | None = None) -> None:
        self.linkedin_tool = linkedin_tool or LinkedInTool()
        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "")

    def enrich(self, lead: dict[str, Any]) -> dict[str, Any]:
        company_name = lead.get("company_name", "")
        website = lead.get("website", "")
        domain = self._extract_domain(website)

        market_query = f"{company_name} buying signals and growth initiatives"
        tavily_results = self._tavily_search(market_query)
        linkedin_data = self.linkedin_tool.resolve_company(domain) if domain else {}

        enriched = dict(lead)
        enriched["domain"] = domain
        enriched["research"] = {
            "tavily_results": tavily_results,
            "linkedin": linkedin_data,
        }
        enriched["fit_notes"] = self._compose_fit_notes(company_name, tavily_results, linkedin_data)
        return enriched

    def _tavily_search(self, query: str) -> list[dict[str, Any]]:
        if not self.tavily_api_key:
            return []

        payload = {
            "api_key": self.tavily_api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": 3,
        }

        try:
            response = requests.post(self.TAVILY_URL, json=payload, timeout=20)
            response.raise_for_status()
            data = response.json()
            return data.get("results", [])
        except requests.RequestException:
            return []

    def _extract_domain(self, url: str) -> str:
        if not url:
            return ""

        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "")

    def _compose_fit_notes(
        self,
        company_name: str,
        tavily_results: list[dict[str, Any]],
        linkedin_data: dict[str, Any],
    ) -> str:
        insights = []
        if tavily_results:
            top_result = tavily_results[0]
            insights.append(f"Top web signal: {top_result.get('title', 'n/a')}")

        employee_count = linkedin_data.get("employee_count")
        if employee_count:
            insights.append(f"Estimated employee count: {employee_count}")

        if not insights:
            return f"Limited public context found for {company_name}."

        return " | ".join(insights)
