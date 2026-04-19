"use client";

import { useEffect, useRef, useState } from "react";

import { getGlobalStats } from "@/lib/huntr-api";
import type { GlobalStatsResponse } from "@/lib/huntr-types";

const REFRESH_INTERVAL_MS = 30_000;
const ANIMATION_DURATION_MS = 1_200;

const ZERO_STATS: GlobalStatsResponse = {
  total_leads_all_time: 0,
  total_emails_sent: 0,
  active_jobs: 0,
};

function clampToSafeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function sanitizeStats(payload: GlobalStatsResponse): GlobalStatsResponse {
  return {
    total_leads_all_time: clampToSafeCount(payload.total_leads_all_time),
    total_emails_sent: clampToSafeCount(payload.total_emails_sent),
    active_jobs: clampToSafeCount(payload.active_jobs),
  };
}

export default function LiveStats() {
  const [displayedStats, setDisplayedStats] = useState<GlobalStatsResponse>(ZERO_STATS);
  const displayedStatsRef = useRef<GlobalStatsResponse>(ZERO_STATS);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const animateTo = (target: GlobalStatsResponse, fromZero: boolean): void => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }

      const startValues = fromZero ? ZERO_STATS : displayedStatsRef.current;
      const startedAt = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / ANIMATION_DURATION_MS);

        const nextStats: GlobalStatsResponse = {
          total_leads_all_time: Math.round(
            startValues.total_leads_all_time +
              (target.total_leads_all_time - startValues.total_leads_all_time) * progress,
          ),
          total_emails_sent: Math.round(
            startValues.total_emails_sent +
              (target.total_emails_sent - startValues.total_emails_sent) * progress,
          ),
          active_jobs: Math.round(
            startValues.active_jobs + (target.active_jobs - startValues.active_jobs) * progress,
          ),
        };

        displayedStatsRef.current = nextStats;
        setDisplayedStats(nextStats);

        if (progress < 1 && !cancelled) {
          rafRef.current = window.requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = window.requestAnimationFrame(tick);
    };

    const fetchAndUpdate = async (fromZero: boolean): Promise<void> => {
      try {
        const latest = sanitizeStats(await getGlobalStats());
        if (!cancelled) {
          animateTo(latest, fromZero);
        }
      } catch {
        // Keep the last displayed values; polling should fail silently.
      }
    };

    void fetchAndUpdate(true);

    const intervalId = window.setInterval(() => {
      void fetchAndUpdate(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,102,255,0.12)]">
        <p className="text-3xl font-bold tracking-tight text-[#0066ff]">
          🎯 {displayedStats.total_leads_all_time.toLocaleString()} leads found
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#6b7280]">Across all campaigns</p>
      </article>

      <article className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,102,255,0.12)]">
        <p className="text-3xl font-bold tracking-tight text-[#0066ff]">
          ✉️ {displayedStats.total_emails_sent.toLocaleString()} emails sent
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#6b7280]">Tracked deliveries</p>
      </article>

      <article className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-200 hover:shadow-[0_6px_16px_rgba(0,102,255,0.12)]">
        <p className="text-3xl font-bold tracking-tight text-[#0066ff]">
          ⚡ {displayedStats.active_jobs.toLocaleString()} active hunts
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#6b7280]">Running right now</p>
      </article>
    </section>
  );
}
