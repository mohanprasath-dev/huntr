"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
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
    return "inline-flex min-h-11 items-center text-sm font-semibold text-[#111827]";
  }

  return "inline-flex min-h-11 items-center text-sm font-medium text-[#374151] transition hover:text-[#111827]";
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const { data: session } = useSession();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const userName = session?.user?.name?.trim() || "User";
  const userEmail = session?.user?.email?.trim() || "No email";
  const userImage = session?.user?.image?.trim() || "";

  const activeJobId = useMemo(() => getJobIdFromPath(pathname), [pathname]);
  const showStopButton = Boolean(activeJobId);

  useEffect(() => {
    setIsMobileOpen(false);
    setStopError(null);
    setIsStopping(false);
    setIsProfileMenuOpen(false);
  }, [pathname]);

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
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-semibold text-white">
                  {userName.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden text-sm font-medium sm:inline">{userName}</span>
            </button>

            {isProfileMenuOpen ? (
              <div className="absolute right-0 top-12 min-w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                <p className="px-3 py-1.5 text-sm font-medium text-[#111827]">👤 {userName}</p>
                <p className="px-3 pb-2 text-xs text-[#6b7280]">📧 {userEmail}</p>
                <div className="my-1 h-px bg-[#e5e7eb]" />
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    void signOut({ callbackUrl: "/" });
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#f9fafb]"
                >
                  Sign out
                </button>
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
