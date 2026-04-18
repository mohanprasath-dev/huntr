from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv


class SerperTool:
    """Simple Serper wrapper for company and intent discovery queries."""

    BASE_URL = "https://google.serper.dev/search"
    SOURCE_MAP = {
        "linkedin.com": "linkedin",
        "reddit.com": "reddit",
        "twitter.com": "twitter",
        "x.com": "twitter",
        "indiamart.com": "indiamart",
        "quora.com": "quora",
    }

    def __init__(self, api_key: str | None = None, timeout: float = 20.0) -> None:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
        else:
            load_dotenv(override=False)

        self.api_key = api_key or os.getenv("SERPER_API_KEY", "")
        self.timeout = timeout

    def search(self, query: str, num_results: int = 10) -> list[dict[str, Any]]:
        if not self.api_key:
            return []

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }
        safe_num_results = max(1, min(num_results, 20))
        payload = {
            "q": query,
            "num": safe_num_results,
        }

        try:
            response = requests.post(
                self.BASE_URL,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("organic", [])
        except requests.RequestException:
            return []

    def scout_leads(self, niche: str, pain_keyword: str) -> list[dict[str, str]]:
        query = self._build_query(niche=niche, pain_keyword=pain_keyword)
        raw_results = self.search(query=query, num_results=20)

        if len(raw_results) < 5:
            broader_query = self._build_broader_query(niche=niche, pain_keyword=pain_keyword)
            broader_results = self.search(query=broader_query, num_results=20)
            raw_results = self._merge_unique_results(raw_results, broader_results, limit=20)

        leads: list[dict[str, str]] = []
        for item in raw_results:
            url = str(item.get("link", "")).strip()
            if not url:
                continue

            source = self._get_source_from_url(url)
            if source == "other":
                continue

            title = str(item.get("title", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            leads.append(
                {
                    "source": source,
                    "url": url,
                    "title": title,
                    "snippet": snippet,
                    "potential_company": self._extract_potential_company(
                        title=title,
                        snippet=snippet,
                        url=url,
                        niche=niche,
                    ),
                    "potential_contact": self._extract_potential_contact(title=title, snippet=snippet),
                }
            )

            if len(leads) >= 20:
                break

        return leads

    def _build_query(self, niche: str, pain_keyword: str) -> str:
        # Keep the requested query format and extend it to include IndiaMART and Quora.
        return (
            f"{pain_keyword} site:linkedin.com OR site:reddit.com OR site:twitter.com "
            f"OR site:x.com OR site:indiamart.com OR site:quora.com \"{niche}\""
        )

    def _build_broader_query(self, niche: str, pain_keyword: str) -> str:
        return (
            f"{pain_keyword} help OR problem OR recommendations site:linkedin.com OR "
            f"site:reddit.com OR site:twitter.com OR site:x.com OR site:indiamart.com "
            f"OR site:quora.com"
        )

    def _merge_unique_results(
        self,
        first: list[dict[str, Any]],
        second: list[dict[str, Any]],
        limit: int,
    ) -> list[dict[str, Any]]:
        merged: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for item in first + second:
            url = str(item.get("link", "")).strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            merged.append(item)

            if len(merged) >= limit:
                break

        return merged

    def _get_source_from_url(self, url: str) -> str:
        hostname = urlparse(url).netloc.lower().replace("www.", "")
        for domain, source in self.SOURCE_MAP.items():
            if domain in hostname:
                return source
        return "other"

    def _extract_potential_company(self, title: str, snippet: str, url: str, niche: str) -> str:
        text = f"{title} {snippet}".strip()
        company_patterns = [
            r"(?:at|from)\s+([A-Z][A-Za-z0-9&.\- ]{1,60})",
            r"([A-Z][A-Za-z0-9&.\- ]+\s(?:Pvt|Private|Ltd|Limited|Inc|LLC|Technologies|Solutions))",
        ]

        for pattern in company_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip(" -|,")

        hostname = urlparse(url).netloc.lower().replace("www.", "")
        company_guess = hostname.split(".")[0] if hostname else ""
        if company_guess and company_guess not in {
            "linkedin",
            "reddit",
            "twitter",
            "x",
            "indiamart",
            "quora",
        }:
            return company_guess.replace("-", " ").title()

        return niche.strip().title()

    def _extract_potential_contact(self, title: str, snippet: str) -> str:
        text = f"{title} {snippet}".strip()

        email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
        if email_match:
            return email_match.group(0)

        contact_patterns = [
            r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*(?:\||-|,)?\s*(?:CEO|Founder|Co-Founder|Director|Manager|Head)",
            r"(?:contact|reach out to|dm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})",
        ]

        for pattern in contact_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()

        return ""
