"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getJobStatus, stopHunt } from "@/lib/huntr-api";

type HuntLifecycleState = "unknown" | "running" | "stopped" | "completed" | "failed";

interface HuntStatusEventDetail {
  jobId: string;
}

function getJobIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/app\/hunt\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return match[1];
  }
}

function toHuntLifecycleState(status: string): HuntLifecycleState {
  const normalized = status.toLowerCase();

  if (normalized === "stopped") {
    return "stopped";
  }
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "failed") {
    return "failed";
  }
  if (normalized === "running" || normalized === "queued" || normalized === "processing") {
    return "running";
  }

  return "unknown";
}

function navLinkClass(isActive: boolean): string {
  if (isActive) {
    return "inline-flex min-h-11 items-center text-sm font-semibold text-[#111827]";
  }

  return "inline-flex min-h-11 items-center text-sm font-medium text-[#374151] transition hover:text-[#111827]";
}

export default function Navbar() {
  const pathname = usePathname();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [huntState, setHuntState] = useState<HuntLifecycleState>("unknown");
  const [stopError, setStopError] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const userName = "Demo User";
  const userEmail = "demo@huntr.local";

  const activeJobId = useMemo(() => getJobIdFromPath(pathname), [pathname]);
  const showStopButton =
    Boolean(activeJobId) &&
    huntState !== "stopped" &&
    huntState !== "completed" &&
    huntState !== "failed";

  useEffect(() => {
    setIsMobileOpen(false);
    setStopError(null);
    setIsStopping(false);
    setIsProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!activeJobId) {
      setHuntState("unknown");
      return;
    }

    let isMounted = true;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;

    const syncHuntState = async (): Promise<void> => {
      try {
        const status = await getJobStatus(activeJobId);
        if (!isMounted) {
          return;
        }

        const nextState = toHuntLifecycleState(String(status.status ?? ""));
        setHuntState(nextState);

        if (nextState === "running" || nextState === "unknown") {
          nextTimer = setTimeout(syncHuntState, 3500);
        }
      } catch {
        if (!isMounted) {
          return;
        }
        nextTimer = setTimeout(syncHuntState, 4500);
      }
    };

    void syncHuntState();

    return () => {
      isMounted = false;
      if (nextTimer) {
        clearTimeout(nextTimer);
      }
    };
  }, [activeJobId]);

  useEffect(() => {
    const onHuntStopped = (event: Event): void => {
      if (!activeJobId) {
        return;
      }

      const detail = (event as CustomEvent<HuntStatusEventDetail>).detail;
      if (!detail || detail.jobId !== activeJobId) {
        return;
      }

      setHuntState("stopped");
    };

    const onHuntCompleted = (event: Event): void => {
      if (!activeJobId) {
        return;
      }

      const detail = (event as CustomEvent<HuntStatusEventDetail>).detail;
      if (!detail || detail.jobId !== activeJobId) {
        return;
      }

      setHuntState("completed");
    };

    const onHuntResumed = (event: Event): void => {
      if (!activeJobId) {
        return;
      }

      const detail = (event as CustomEvent<Partial<HuntStatusEventDetail>>).detail;
      if (detail?.jobId && detail.jobId !== activeJobId) {
        return;
      }

      setHuntState("running");
      setStopError(null);
    };

    window.addEventListener("hunt-stopped", onHuntStopped as EventListener);
    window.addEventListener("hunt-completed", onHuntCompleted as EventListener);
    window.addEventListener("hunt-resumed", onHuntResumed);

    return () => {
      window.removeEventListener("hunt-stopped", onHuntStopped as EventListener);
      window.removeEventListener("hunt-completed", onHuntCompleted as EventListener);
      window.removeEventListener("hunt-resumed", onHuntResumed);
    };
  }, [activeJobId]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (
        profileMenuRef.current &&
        target instanceof Node &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isProfileMenuOpen]);

  const isHome = pathname === "/app" || pathname === "/app/";
  const isCampaigns = pathname === "/app/campaigns" || pathname.startsWith("/app/campaigns/");

  async function handleStopHunt(): Promise<void> {
    if (!activeJobId || isStopping) {
      return;
    }

    setIsStopping(true);
    setStopError(null);

    try {
      await stopHunt(activeJobId);
      window.dispatchEvent(
        new CustomEvent<HuntStatusEventDetail>("hunt-stopped", {
          detail: { jobId: activeJobId },
        }),
      );
      setHuntState("stopped");
      setIsMobileOpen(false);
    } catch (error) {
      setStopError(error instanceof Error ? error.message : "Unable to stop this hunt.");
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#e5e7eb] bg-white">
      <nav
        className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-4 md:px-8"
        aria-label="Primary"
      >
        <Link
          href="/app"
          className="font-mono text-xl font-bold tracking-[0.2em] text-[#111827] transition hover:text-[#374151]"
        >
          HUNTR
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <Link href="/app" className={navLinkClass(isHome)}>
            New Hunt
          </Link>
          <Link href="/app/campaigns" className={navLinkClass(isCampaigns)}>
            Campaigns
          </Link>
          {showStopButton ? (
            <button
              type="button"
              onClick={handleStopHunt}
              disabled={isStopping}
              className="min-h-11 rounded-md border border-[#dc2626] px-3 py-1.5 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStopping ? "Stopping..." : "⬛ Stop Hunt"}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((value) => !value)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e5e7eb] px-2.5 text-[#111827] transition hover:bg-[#f9fafb]"
              aria-label="Toggle account menu"
              aria-expanded={isProfileMenuOpen}
            >
              <span
                className="inline-flex h-8 items-center text-[0.65rem] font-semibold uppercase tracking-widest text-[#6b7280] sm:hidden"
                aria-hidden="true"
              >
                Account
              </span>
              <span className="hidden text-sm font-medium sm:inline">{userName}</span>
            </button>

            {isProfileMenuOpen ? (
              <div className="absolute right-0 top-12 min-w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                <p className="px-3 py-1.5 text-sm font-medium text-[#111827]">👤 {userName}</p>
                <p className="px-3 pb-2 text-xs text-[#6b7280]">📧 {userEmail}</p>
                <div className="my-1 h-px bg-[#e5e7eb]" />
                <p className="px-3 py-2 text-xs text-[#6b7280]">Authentication disabled for demo.</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#e5e7eb] text-[#374151] transition hover:bg-[#f9fafb] md:hidden"
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileOpen}
            aria-controls="mobile-primary-nav"
            onClick={() => setIsMobileOpen((value) => !value)}
          >
            <span className="sr-only">Toggle menu</span>
            <span className="relative block h-4 w-5">
              <span
                className={`absolute left-0 top-0 h-0.5 w-5 bg-current transition ${
                  isMobileOpen ? "translate-y-1.75 rotate-45" : ""
                }`}
              />
              <span
                className={`absolute left-0 top-1.75 h-0.5 w-5 bg-current transition ${
                  isMobileOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 top-3.5 h-0.5 w-5 bg-current transition ${
                  isMobileOpen ? "-translate-y-1.75 -rotate-45" : ""
                }`}
              />
            </span>
          </button>
        </div>
      </nav>

      {isMobileOpen ? (
        <div id="mobile-primary-nav" className="border-t border-[#e5e7eb] bg-white md:hidden">
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 px-4 py-4">
            <Link href="/app" className={navLinkClass(isHome)} onClick={() => setIsMobileOpen(false)}>
              New Hunt
            </Link>
            <Link
              href="/app/campaigns"
              className={navLinkClass(isCampaigns)}
              onClick={() => setIsMobileOpen(false)}
            >
              Campaigns
            </Link>
            {showStopButton ? (
              <button
                type="button"
                onClick={handleStopHunt}
                disabled={isStopping}
                className="min-h-11 w-full rounded-md border border-[#dc2626] px-3 py-2 text-left text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStopping ? "Stopping..." : "⬛ Stop Hunt"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {stopError ? (
        <div className="border-t border-[#e5e7eb] bg-[#fff7f7] px-4 py-2 text-xs text-[#dc2626] md:px-8">
          {stopError}
        </div>
      ) : null}
    </header>
  );
}
