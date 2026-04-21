from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


class TavilyTool:
    """Small Tavily search wrapper for discovery and enrichment workflows."""

    BASE_URL = "https://api.tavily.com/search"
    _MAX_RETRIES = 2
    _RETRY_BACKOFF = 1.5

    def __init__(self, api_key: str | None = None, timeout: float = 12.0) -> None:
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
            logger.warning("[TavilyTool] TAVILY_API_KEY not set — skipping search")
            return []

        safe_max_results = max(1, min(max_results, 20))
        # Tavily v2 API: Bearer token in Authorization header, NOT in body
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "query": query,
            "search_depth": search_depth,
            "max_results": safe_max_results,
            "include_raw_content": include_raw_content,
        }

        for attempt in range(self._MAX_RETRIES + 1):
            try:
                response = requests.post(
                    self.BASE_URL,
                    headers=headers,
                    json=payload,
                    timeout=self.timeout,
                )
                if response.status_code == 429:
                    wait = self._RETRY_BACKOFF * (attempt + 1)
                    logger.warning(
                        "[TavilyTool] Rate limited (429). Waiting %.1fs before retry %d/%d",
                        wait, attempt + 1, self._MAX_RETRIES,
                    )
                    if attempt < self._MAX_RETRIES:
                        time.sleep(wait)
                        continue
                    return []

                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])
                return results if isinstance(results, list) else []

            except requests.RequestException as exc:
                logger.warning(
                    "[TavilyTool] Request failed (attempt %d/%d): %s",
                    attempt + 1, self._MAX_RETRIES + 1, exc,
                )
                if attempt < self._MAX_RETRIES:
                    time.sleep(self._RETRY_BACKOFF * (attempt + 1))
                else:
                    logger.error("[TavilyTool] All retries exhausted for query: %r", query)
                    return []

        return []