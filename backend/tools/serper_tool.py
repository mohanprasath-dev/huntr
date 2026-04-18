from __future__ import annotations

import os
from typing import Any

import requests


class SerperTool:
    """Simple Serper wrapper for company and intent discovery queries."""

    BASE_URL = "https://google.serper.dev/search"

    def __init__(self, api_key: str | None = None, timeout: float = 20.0) -> None:
        self.api_key = api_key or os.getenv("SERPER_API_KEY", "")
        self.timeout = timeout

    def search(self, query: str, num_results: int = 10) -> list[dict[str, Any]]:
        if not self.api_key:
            return []

        headers = {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "q": query,
            "num": num_results,
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
