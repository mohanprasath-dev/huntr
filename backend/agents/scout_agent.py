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

    _EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
    _ROLE_PATTERN = re.compile(
        r"((?:CEO|Founder|Co-Founder|CTO|Head of Sales|VP Sales|Director)\b[^,.|]{0,50})",
        re.IGNORECASE,
    )
    _MULTIPART_TLDS = {
        "co.in",
        "org.in",
        "net.in",
        "gov.in",
        "ac.in",
        "co.uk",
        "com.au",
    }
    _BLOCKED_DOMAIN_TERMS = (
        "medium.com",
        "substack.com",
        "youtube.com",
        "reddit.com",
    )
    _BLOCKED_URL_TERMS = (
        "blog",
        "article",
        "news",
    )
    _COMPANY_PAGE_HINTS = (
        "/company/",
        "/companies/",
        "/organization/",
        "/about",
        "/about-us",
        "/our-company",
        "/profile/company",
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

    def find_candidates(
        self,
        niche: str,
        max_leads: int = 20,
        pain_keyword: str = "",
    ) -> list[dict[str, Any]]:
        safe_max_leads = max(1, min(max_leads, 50))
        serper_hits = self._serper_hits(
            niche=niche,
            pain_keyword=pain_keyword,
            max_leads=safe_max_leads,
        )
        raw_hits = self._merge_hits(serper_hits)

        leads: list[dict[str, Any]] = []
        seen_domains: set[str] = set()
        for hit in raw_hits:
            url = str(hit.get("url", "")).strip()
            domain = self._extract_root_domain(url)
            if not url or not domain or domain in seen_domains:
                continue

            title = str(hit.get("title", "")).strip()
            snippet = str(hit.get("snippet", "")).strip()
            company_name = self._extract_company_name(url=url)
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
            seen_domains.add(domain)

            if len(leads) >= safe_max_leads:
                break

        return leads

    def _serper_hits(self, niche: str, pain_keyword: str, max_leads: int) -> list[dict[str, Any]]:
        cleaned_niche = niche.strip()
        cleaned_pain_keyword = pain_keyword.strip() or cleaned_niche
        queries = [
            f"{cleaned_niche} company India startup hiring sales",
            f"founder CEO {cleaned_niche} startup India site:linkedin.com",
            f"{cleaned_pain_keyword} {cleaned_niche} startup India looking for solution",
            f"{cleaned_niche} service provider India",
            f"{cleaned_niche} startups India funded 2024 2025",
        ]

        hits: list[dict[str, Any]] = []
        per_query = max(5, min(12, max_leads))
        for query_index, query in enumerate(queries):
            results = self.serper_tool.search(query=query, num_results=per_query)
            for item in results:
                url = str(item.get("link", "")).strip()
                if not url or self._should_exclude_url(url):
                    continue

                hits.append(
                    {
                        "source": "serper",
                        "url": url,
                        "title": str(item.get("title", "")).strip(),
                        "snippet": str(item.get("snippet", "")).strip(),
                        "query_index": query_index,
                        "is_homepage": self._is_company_homepage(url),
                    }
                )
        hits.sort(
            key=lambda hit: (
                not bool(hit.get("is_homepage", False)),
                int(hit.get("query_index", 0)),
            )
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

    def _merge_hits(self, serper_hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        seen_domains: set[str] = set()
        for item in serper_hits:
            url = str(item.get("url", "")).strip()
            domain = self._extract_root_domain(url)
            if not url or not domain or domain in seen_domains:
                continue
            seen_domains.add(domain)
            merged.append(item)
        return merged

    def _extract_company_name(self, url: str) -> str:
        root_domain = self._extract_root_domain(url)
        if root_domain:
            domain_head = root_domain.split(".")[0]
            cleaned_name = re.sub(r"[^A-Za-z0-9]+", " ", domain_head).strip()
            if cleaned_name:
                return cleaned_name.title()
        return "Unknown Company"

    def _extract_root_domain(self, url: str) -> str:
        host = urlparse(url).netloc.lower().replace("www.", "")
        host = host.split(":")[0]
        if not host:
            return ""

        host_parts = [part for part in host.split(".") if part]
        if len(host_parts) <= 2:
            return ".".join(host_parts)

        tail = ".".join(host_parts[-2:])
        if tail in self._MULTIPART_TLDS and len(host_parts) >= 3:
            return ".".join(host_parts[-3:])

        return ".".join(host_parts[-2:])

    def _is_explicit_company_page(self, url: str) -> bool:
        lowered = url.lower()
        return any(hint in lowered for hint in self._COMPANY_PAGE_HINTS)

    def _should_exclude_url(self, url: str) -> bool:
        lowered = url.lower()
        if self._is_explicit_company_page(lowered):
            return False

        if any(term in lowered for term in self._BLOCKED_DOMAIN_TERMS):
            return True

        return any(term in lowered for term in self._BLOCKED_URL_TERMS)

    def _is_company_homepage(self, url: str) -> bool:
        parsed = urlparse(url)
        path = parsed.path.lower().strip()
        if any(marker in path for marker in ("/blog/", "/post/", "/article/")):
            return False

        normalized_path = path.strip("/")
        return normalized_path in {"", "home", "index", "index.html"}

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
