from __future__ import annotations

import os
from typing import Any

import requests


class LinkedInTool:
    """Minimal Proxycurl-backed LinkedIn company enrichment helper."""

    RESOLVE_URL = "https://nubela.co/proxycurl/api/linkedin/company/resolve"
    PROFILE_URL = "https://nubela.co/proxycurl/api/linkedin/company"

    def __init__(self, api_key: str | None = None, timeout: float = 20.0) -> None:
        self.api_key = api_key or os.getenv("PROXYCURL_API_KEY", "")
        self.timeout = timeout

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
