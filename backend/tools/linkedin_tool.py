from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from tools.serper_tool import SerperTool


class LinkedInTool:
    """Proxycurl-backed LinkedIn helper with Serper fallback."""

    RESOLVE_URL = "https://nubela.co/proxycurl/api/linkedin/company/resolve"
    PROFILE_URL = "https://nubela.co/proxycurl/api/linkedin/company"

    def __init__(
        self,
        api_key: str | None = None,
        serper_tool: SerperTool | None = None,
        timeout: float = 20.0,
    ) -> None:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
        else:
            load_dotenv(override=False)

        self.api_key = api_key or os.getenv("PROXYCURL_API_KEY", "")
        self.serper_tool = serper_tool or SerperTool(timeout=timeout)
        self.timeout = timeout

    def get_linkedin_profile(self, company_name: str) -> dict[str, Any]:
        cleaned_name = str(company_name).strip()
        if not cleaned_name:
            return self._empty_profile(company_name="")

        proxycurl_profile = self._get_proxycurl_profile(cleaned_name)
        if self._is_profile_usable(proxycurl_profile):
            return proxycurl_profile

        return self._fallback_profile_from_serper(cleaned_name)

    def resolve_company(self, domain: str) -> dict[str, Any]:
        if not self.api_key or not domain:
            return {}

        headers = {"Authorization": f"Bearer {self.api_key}"}

        try:
            resolve_resp = requests.get(
                self.RESOLVE_URL,
                headers=headers,
                params={"company_domain": domain},
                timeout=self.timeout,
            )
            resolve_resp.raise_for_status()
            resolve_data = resolve_resp.json()
        except requests.RequestException:
            return {}

        linkedin_url = resolve_data.get("url")
        profile_data = self._fetch_profile(linkedin_url) if linkedin_url else {}

        result = {
            "domain": domain,
            "linkedin_url": linkedin_url,
        }
        result.update(profile_data)
        return result

    def _get_proxycurl_profile(self, company_name: str) -> dict[str, Any]:
        if not self.api_key:
            return {}

        headers = {"Authorization": f"Bearer {self.api_key}"}

        linkedin_url = ""
        try:
            resolve_resp = requests.get(
                self.RESOLVE_URL,
                headers=headers,
                params={"company_name": company_name},
                timeout=self.timeout,
            )
            resolve_resp.raise_for_status()
            resolve_data = resolve_resp.json()
            linkedin_url = str(resolve_data.get("url", "")).strip()
        except requests.RequestException:
            return {}

        if not linkedin_url:
            return {}

        try:
            profile_resp = requests.get(
                self.PROFILE_URL,
                headers=headers,
                params={
                    "url": linkedin_url,
                    "fallback_to_cache": "on-error",
                },
                timeout=self.timeout,
            )
            profile_resp.raise_for_status()
            profile = profile_resp.json()
        except requests.RequestException:
            return {}

        profile_name = str(profile.get("name") or company_name).strip()
        title = self._infer_title(profile)
        recent_posts = self._extract_recent_posts(profile)

        return {
            "name": profile_name,
            "title": title,
            "company": profile_name,
            "recent_posts": recent_posts,
            "linkedin_url": linkedin_url,
            "source": "proxycurl",
        }

    def _fetch_profile(self, linkedin_url: str) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.api_key}"}

        try:
            profile_resp = requests.get(
                self.PROFILE_URL,
                headers=headers,
                params={
                    "url": linkedin_url,
                    "fallback_to_cache": "on-error",
                },
                timeout=self.timeout,
            )
            profile_resp.raise_for_status()
            profile = profile_resp.json()
        except requests.RequestException:
            return {}

        return {
            "name": profile.get("name"),
            "website": profile.get("website"),
            "employee_count": profile.get("employee_count"),
            "follower_count": profile.get("follower_count"),
            "description": profile.get("description"),
        }

    def _fallback_profile_from_serper(self, company_name: str) -> dict[str, Any]:
        results = self.serper_tool.search(
            query=(
                f"site:linkedin.com ({company_name}) "
                "(\"/company/\" OR \"/posts/\" OR leadership OR founder)"
            ),
            num_results=8,
        )

        if not results:
            return self._empty_profile(company_name)

        company_result = results[0]
        name = str(company_result.get("title") or company_name).strip()
        snippet = str(company_result.get("snippet") or "").strip()
        title = self._short_text(snippet, max_words=12) or "LinkedIn activity found"

        post_candidates: list[str] = []
        for item in results:
            item_title = str(item.get("title") or "").strip()
            item_snippet = str(item.get("snippet") or "").strip()
            item_link = str(item.get("link") or "").strip()
            lowered_link = item_link.lower()
            lowered_text = f"{item_title} {item_snippet}".lower()
            if "/posts/" in lowered_link or "post" in lowered_text or "update" in lowered_text:
                text = item_title or item_snippet
                if text:
                    post_candidates.append(self._short_text(text, max_words=16))

        return {
            "name": name,
            "title": title,
            "company": company_name,
            "recent_posts": post_candidates[:3],
            "source": "serper_fallback",
        }

    def _extract_recent_posts(self, profile: dict[str, Any]) -> list[str]:
        post_candidates = profile.get("updates") or profile.get("posts") or profile.get("activities")
        if not isinstance(post_candidates, list):
            return []

        posts: list[str] = []
        for item in post_candidates:
            if isinstance(item, dict):
                text = str(item.get("text") or item.get("title") or item.get("content") or "").strip()
            else:
                text = str(item).strip()
            if text:
                posts.append(self._short_text(text, max_words=18))
            if len(posts) >= 3:
                break
        return posts

    def _infer_title(self, profile: dict[str, Any]) -> str:
        for key in ("tagline", "headline", "industry"):
            value = str(profile.get(key) or "").strip()
            if value:
                return self._short_text(value, max_words=12)

        description = str(profile.get("description") or "").strip()
        if description:
            return self._short_text(description, max_words=12)

        return "LinkedIn company profile"

    def _is_profile_usable(self, profile: dict[str, Any]) -> bool:
        if not isinstance(profile, dict) or not profile:
            return False
        return bool(profile.get("name") and profile.get("company"))

    def _empty_profile(self, company_name: str) -> dict[str, Any]:
        return {
            "name": company_name,
            "title": "No LinkedIn profile data found",
            "company": company_name,
            "recent_posts": [],
            "source": "none",
        }

    def _short_text(self, text: str, max_words: int) -> str:
        words = [word for word in text.split() if word]
        if len(words) <= max_words:
            return " ".join(words)
        return " ".join(words[:max_words])
