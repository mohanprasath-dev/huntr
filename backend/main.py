from __future__ import annotations

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        # reload=True causes watchfiles to spawn a child process which exits
        # when the parent shell session is closed or interrupted mid-startup.
        # Use reload=False for stability; enable only during active development.
        reload=False,
        log_level="info",
    )
