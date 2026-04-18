from __future__ import annotations

from typing import Any

from tools.serper_tool import SerperTool


class ScoutAgent:
    """Finds initial B2B lead candidates from search signals."""

    def __init__(
        self,
        serper_tool: SerperTool | None = None,
        gemini_llm: Any | None = None,
    ) -> None:
        self.serper_tool = serper_tool or SerperTool()
        self.gemini_llm = gemini_llm

    def find_candidates(self, niche: str, max_leads: int = 10) -> list[dict[str, Any]]:
        query = f"{niche} SaaS companies decision maker contact"
        search_results = self.serper_tool.search(query=query, num_results=max_leads * 2)

        candidates: list[dict[str, Any]] = []
        for item in search_results[:max_leads]:
            candidates.append(
                {
                    "company_name": item.get("title", "Unknown Company"),
                    "website": item.get("link", ""),
                    "summary": item.get("snippet", ""),
                    "source_query": query,
                }
            )

        return candidates
