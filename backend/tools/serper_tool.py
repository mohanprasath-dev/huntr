from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


class SerperTool:
    """Serper.dev Google Search wrapper with retry logic."""

    BASE_URL = "https://google.serper.dev/search"
    _MAX_RETRIES = 2
    _RETRY_BACKOFF = 1.5

    def __init__(self, api_key: str | None = None, timeout: float = 15.0) -> None:
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=False)
        else:
            load_dotenv(override=False)

        self.api_key = api_key or os.getenv("SERPER_API_KEY", "")
        self.timeout = timeout

    def search(self, query: str, num_results: int = 10) -> list[dict[str, Any]]:
        if not self.api_key:
            logger.warning("[SerperTool] SERPER_API_KEY not set — skipping search")
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
                        "[SerperTool] Rate limited (429). Waiting %.1fs before retry %d/%d",
                        wait, attempt + 1, self._MAX_RETRIES,
                    )
                    if attempt < self._MAX_RETRIES:
                        time.sleep(wait)
                        continue
                    return []

                response.raise_for_status()
                return response.json().get("organic", [])

            except requests.RequestException as exc:
                logger.warning(
                    "[SerperTool] Request failed (attempt %d/%d): %s",
                    attempt + 1, self._MAX_RETRIES + 1, exc,
                )
                if attempt < self._MAX_RETRIES:
                    time.sleep(self._RETRY_BACKOFF * (attempt + 1))
                else:
                    logger.error("[SerperTool] All retries exhausted for query: %r", query)
                    return []

        return []
