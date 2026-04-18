from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LeadSignals:
    icp_match: float = 0.0
    intent_strength: float = 0.0
    company_size_fit: float = 0.0
    decision_maker_reachability: float = 0.0

    def as_dict(self) -> dict[str, float]:
        return {
            "icp_match": self.icp_match,
            "intent_strength": self.intent_strength,
            "company_size_fit": self.company_size_fit,
            "decision_maker_reachability": self.decision_maker_reachability,
        }


class LeadScorer:
    """Weighted lead scoring utility used by the scorer agent."""

    def __init__(self, weights: dict[str, float] | None = None) -> None:
        self.weights = weights or {
            "icp_match": 0.35,
            "intent_strength": 0.3,
            "company_size_fit": 0.2,
            "decision_maker_reachability": 0.15,
        }

    def score(self, signals: LeadSignals) -> tuple[float, str]:
        normalized = {
            key: max(0.0, min(1.0, getattr(signals, key, 0.0)))
            for key in self.weights
        }

        total = sum(normalized[key] * self.weights[key] * 100 for key in self.weights)

        if total >= 75:
            tier = "A"
        elif total >= 55:
            tier = "B"
        else:
            tier = "C"

        return total, tier
