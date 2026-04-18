from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from tools.serper_tool import SerperTool
from tools.tavily_tool import TavilyTool


class ScoutAgent:
    """Lead Scout: discovers raw B2B leads that show pain signals."""

    name = "Lead Scout"
    goal = "Find 20 potential B2B leads showing pain signals matching the target niche"

    _COMPANY_PATTERN = re.compile(
        r"([A-Z][A-Za-z0-9&.\- ]{2,60}\s(?:Inc|LLC|Ltd|Limited|Technologies|Solutions|Labs|Systems|Corp))"
    )
    _EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    _ROLE_PATTERN = re.compile(
        r"((?:CEO|Founder|Co-Founder|CTO|Head of Sales|VP Sales|Director)\b[^,.|]{0,50})",
        re.IGNORECASE,
    )

    def __init__(
        self,
        serper_tool: SerperTool | None = None,
        tavily_tool: TavilyTool | None = None,
        gemini_llm: Any | None = None,
    ) -> None:
        self.serper_tool = serper_tool or SerperTool()
        self.tavily_tool = tavily_tool or TavilyTool()
        self.gemini_llm = gemini_llm

    def find_candidates(self, niche: str, max_leads: int = 20) -> list[dict[str, Any]]:
        safe_max_leads = max(1, min(max_leads, 50))
        serper_hits = self._serper_hits(niche=niche, max_leads=safe_max_leads)
        tavily_hits = self._tavily_hits(niche=niche, max_leads=safe_max_leads)
        raw_hits = self._merge_hits(serper_hits, tavily_hits)

        leads: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for hit in raw_hits:
            url = str(hit.get("url", "")).strip()
            if not url or url in seen_urls:
                continue

            title = str(hit.get("title", "")).strip()
            snippet = str(hit.get("snippet", "")).strip()
            company_name = self._extract_company_name(title=title, snippet=snippet, url=url)
            contact_hint = self._extract_contact_hint(title=title, snippet=snippet, url=url)

            leads.append(
                {
                    "source": str(hit.get("source", "")).strip() or "unknown",
                    "url": url,
                    "company_name": company_name,
                    "contact_hint": contact_hint,
                    "pain_signal": snippet,
                }
            )
            seen_urls.add(url)

            if len(leads) >= safe_max_leads:
                break

        return leads

    def _serper_hits(self, niche: str, max_leads: int) -> list[dict[str, str]]:
        queries = [
            f"{niche} struggling with outbound growth B2B",
            f"{niche} hiring sales team but low pipeline",
            f"{niche} looking for lead generation agency",
            f"{niche} manual prospecting bottleneck",
        ]

        hits: list[dict[str, str]] = []
        per_query = max(5, min(12, max_leads))
        for query in queries:
            results = self.serper_tool.search(query=query, num_results=per_query)
            for item in results:
                hits.append(
                    {
                        "source": "serper",
                        "url": str(item.get("link", "")).strip(),
                        "title": str(item.get("title", "")).strip(),
                        "snippet": str(item.get("snippet", "")).strip(),
                    }
                )

        return hits

    def _tavily_hits(self, niche: str, max_leads: int) -> list[dict[str, str]]:
        queries = [
            f"{niche} companies discussing growth challenges",
            f"{niche} company expansion pain points sales ops",
            f"{niche} startup lead generation problems",
        ]

        hits: list[dict[str, str]] = []
        per_query = max(4, min(10, max_leads))
        for query in queries:
            results = self.tavily_tool.search(query=query, max_results=per_query)
            for item in results:
                hits.append(
                    {
                        "source": "tavily",
                        "url": str(item.get("url", "")).strip(),
                        "title": str(item.get("title", "")).strip(),
                        "snippet": str(item.get("content", "")).strip(),
                    }
                )

        return hits

    def _merge_hits(
        self,
        serper_hits: list[dict[str, str]],
        tavily_hits: list[dict[str, str]],
    ) -> list[dict[str, str]]:
        merged: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in serper_hits + tavily_hits:
            url = str(item.get("url", "")).strip()
            if not url or url in seen:
                continue
            seen.add(url)
            merged.append(item)
        return merged

    def _extract_company_name(self, title: str, snippet: str, url: str) -> str:
        source_text = f"{title} {snippet}".strip()
        company_match = self._COMPANY_PATTERN.search(source_text)
        if company_match:
            return company_match.group(1).strip()

        title_head = title.split("|")[0].split("-")[0].strip()
        if title_head and len(title_head) > 2:
            return title_head

        host = urlparse(url).netloc.lower().replace("www.", "")
        domain_head = host.split(".")[0] if host else ""
        if domain_head:
            return domain_head.replace("-", " ").title()
        return "Unknown Company"

    def _extract_contact_hint(self, title: str, snippet: str, url: str) -> str:
        text = f"{title} {snippet} {url}".strip()

        email_match = self._EMAIL_PATTERN.search(text)
        if email_match:
            return email_match.group(0)

        role_match = self._ROLE_PATTERN.search(text)
        if role_match:
            return role_match.group(1).strip()

        if "linkedin.com/in/" in url:
            handle = url.split("linkedin.com/in/")[-1].split("/")[0]
            if handle:
                return f"LinkedIn profile: {handle}"

        return "No direct contact found"
