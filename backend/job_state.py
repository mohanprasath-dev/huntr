from __future__ import annotations

import threading
from typing import Any

JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()

__all__ = ["JOBS", "JOBS_LOCK"]
