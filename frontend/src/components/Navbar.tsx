"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HUNTR_API_BASE_URL } from "@/lib/huntr-api";

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

async function parseStopError(response: Response): Promise<string> {
  let detail = `${response.status} ${response.statusText}`.trim();

  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim().length > 0) {
      detail = payload.detail.trim();
    } else if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      detail = payload.message.trim();
    }
  } catch {
    // Ignore non-JSON error payloads.
  }

  return detail || "Unable to stop this hunt.";
}

function navLinkClass(isActive: boolean): string {
  if (isActive) {
    return "text-sm font-medium text-white";
  }

  return "text-sm font-medium text-slate-300 transition hover:text-white";
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const activeJobId = useMemo(() => getJobIdFromPath(pathname), [pathname]);
  const showStopButton = Boolean(activeJobId);

  useEffect(() => {
    setIsMobileOpen(false);
    setStopError(null);
    setIsStopping(false);
  }, [pathname]);

  const isHome = pathname === "/app" || pathname === "/app/";
  const isCampaigns = pathname === "/app/campaigns" || pathname.startsWith("/app/campaigns/");

  async function handleStopHunt(): Promise<void> {
    if (!activeJobId || isStopping) {
      return;
    }

    setIsStopping(true);
    setStopError(null);

    try {
      const response = await fetch(
        `${HUNTR_API_BASE_URL}/hunt/${encodeURIComponent(activeJobId)}/stop`,
        {
          method: "POST",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(await parseStopError(response));
      }

      setIsMobileOpen(false);
      router.refresh();
    } catch (error) {
      setStopError(error instanceof Error ? error.message : "Unable to stop this hunt.");
    } finally {
      setIsStopping(false);
    }
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]">
      <nav
        className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between px-4 md:px-8"
        aria-label="Primary"
      >
        <Link
          href="/app"
          className="font-mono text-xl font-bold tracking-[0.2em] text-[#0066ff] transition hover:text-blue-300"
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
              className="rounded-md border border-red-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStopping ? "Stopping..." : "⬛ Stop Hunt"}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#1a1a1a] text-slate-200 md:hidden"
          aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileOpen}
          aria-controls="mobile-primary-nav"
          onClick={() => setIsMobileOpen((value) => !value)}
        >
          <span className="sr-only">Toggle menu</span>
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-5 bg-current transition ${
                isMobileOpen ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-[7px] h-0.5 w-5 bg-current transition ${
                isMobileOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 top-[14px] h-0.5 w-5 bg-current transition ${
                isMobileOpen ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>
      </nav>

      {isMobileOpen ? (
        <div id="mobile-primary-nav" className="border-t border-[#1a1a1a] bg-[#0a0a0a] md:hidden">
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
                className="w-full rounded-md border border-red-500 px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStopping ? "Stopping..." : "⬛ Stop Hunt"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {stopError ? (
        <div className="border-t border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2 text-xs text-red-300 md:px-8">
          {stopError}
        </div>
      ) : null}
    </header>
  );
}
