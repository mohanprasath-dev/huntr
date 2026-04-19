"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getCampaignHistory } from "@/lib/huntr-api";
import type { CampaignSummary } from "@/lib/huntr-types";

function formatTimeAgo(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return "unknown";
  }

  const createdAtDate = new Date(createdAt);
  const createdAtMs = createdAtDate.getTime();
  if (Number.isNaN(createdAtMs)) {
    return "unknown";
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));

  if (deltaSeconds < 45) {
    return "just now";
  }
  if (deltaSeconds < 3600) {
    const minutes = Math.max(1, Math.floor(deltaSeconds / 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (deltaSeconds < 86400) {
    const hours = Math.floor(deltaSeconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (deltaSeconds < 172800) {
    return "yesterday";
  }

  const days = Math.floor(deltaSeconds / 86400);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function statusBadgeClass(status: string): string {
  if (status === "completed") {
    return "border-emerald-400/45 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "failed") {
    return "border-rose-400/45 bg-rose-500/10 text-rose-200";
  }
  if (status === "running") {
    return "animate-pulse border-accent/45 bg-accent/20 text-blue-100";
  }
  return "border-white/20 bg-white/5 text-white/80";
}

export default function CampaignHistory() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadCampaigns = async (): Promise<void> => {
      try {
        const allCampaigns = await getCampaignHistory();
        if (!isMounted) {
          return;
        }

        setCampaigns(Array.isArray(allCampaigns) ? allCampaigns : []);
        setError("");
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        const detail =
          loadError instanceof Error ? loadError.message : "Unable to load campaign history.";
        setError(detail);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCampaigns();

    return () => {
      isMounted = false;
    };
  }, []);

  const recentCampaigns = useMemo(() => campaigns.slice(0, 5), [campaigns]);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:gap-3 sm:overflow-visible sm:pb-0">
        <div className="h-28 w-[88%] shrink-0 animate-pulse rounded-xl border border-white/10 bg-white/3 sm:w-full sm:shrink" />
        <div className="h-28 w-[88%] shrink-0 animate-pulse rounded-xl border border-white/10 bg-white/3 sm:w-full sm:shrink" />
      </div>
    );
  }

  if (recentCampaigns.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-panel px-4 py-5 text-sm text-muted">
        No campaigns yet. Start your first hunt above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:block sm:space-y-3 sm:overflow-visible sm:pb-0">
        {recentCampaigns.map((campaign) => {
          const status = String(campaign.status || "unknown").toLowerCase();
          const leadsFound = Number(campaign.leads_found ?? campaign.leads_count ?? 0);
          const leadsQualified = Number(campaign.leads_qualified ?? campaign.leads_count ?? 0);

          return (
            <button
              key={campaign.job_id}
              type="button"
              onClick={() => router.push(`/hunt/${campaign.job_id}`)}
              className="w-[88%] shrink-0 snap-start rounded-xl border border-white/10 bg-panel px-4 py-3 text-left transition hover:border-accent/40 hover:bg-panel-elevated sm:w-full sm:shrink"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{campaign.niche || "Unknown niche"}</p>
                  <p className="mt-1 text-sm text-muted">
                    Pain keyword: <span className="text-white/85">{campaign.pain_keyword || "N/A"}</span>
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(status)}`}
                >
                  {status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <p className="text-white/90">
                  Leads found: <span className="font-semibold text-white">{leadsFound}</span>
                </p>
                <p className="text-white/90">
                  Qualified: <span className="font-semibold text-white">{leadsQualified}</span>
                </p>
                <p className="text-muted">{formatTimeAgo(campaign.created_at ?? null)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
