from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv


class TavilyTool:
    """Small Tavily search wrapper for discovery and enrichment workflows."""

    BASE_URL = "https://api.tavily.com/search"

    def __init__(self, api_key: str | None = None, timeout: float = 20.0) -> None:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
        else:
            load_dotenv(override=False)

        self.api_key = api_key or os.getenv("TAVILY_API_KEY", "")
        self.timeout = timeout

    def search(
        self,
        query: str,
        max_results: int = 5,
        search_depth: str = "advanced",
        include_raw_content: bool = False,
    ) -> list[dict[str, Any]]:
        if not self.api_key:
            return []

        safe_max_results = max(1, min(max_results, 20))
        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": search_depth,
            "max_results": safe_max_results,
            "include_raw_content": include_raw_content,
        }

        try:
            response = requests.post(self.BASE_URL, json=payload, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
        except requests.RequestException:
            return []

        results = data.get("results", [])
        if isinstance(results, list):
            return results
        return []