"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getCampaignHistory } from "@/lib/huntr-api";
import type { CampaignComparison, CampaignSummary } from "@/lib/huntr-types";

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

function formatAvgScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return value.toFixed(1);
}

function getAvgScore(campaign: CampaignSummary): number | null {
  const direct = campaign.avg_score;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }

  const maybeAverageScore = (campaign as CampaignSummary & { average_score?: unknown }).average_score;
  if (typeof maybeAverageScore === "number" && Number.isFinite(maybeAverageScore)) {
    return maybeAverageScore;
  }

  return null;
}

function getLeadCounts(campaign: CampaignSummary): { found: number; qualified: number } {
  const fallback = Number(campaign.leads_count ?? 0);
  const found = Number(campaign.leads_found ?? fallback);
  const qualified = Number(campaign.leads_qualified ?? fallback);

  return {
    found: Number.isFinite(found) ? found : 0,
    qualified: Number.isFinite(qualified) ? qualified : 0,
  };
}

function getEmailsSent(campaign: CampaignSummary): number {
  const withEmailMetrics = campaign as CampaignSummary & {
    emails_sent?: unknown;
    sent_count?: unknown;
    emails_personalized?: unknown;
  };

  const possibleValues = [
    withEmailMetrics.emails_sent,
    withEmailMetrics.sent_count,
    withEmailMetrics.emails_personalized,
  ];

  for (const value of possibleValues) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
  }

  return 0;
}

function getQualifiedRate(campaign: CampaignSummary): number {
  const leads = getLeadCounts(campaign);
  if (leads.found <= 0) {
    return 0;
  }
  return (leads.qualified / leads.found) * 100;
}

function buildComparison(campaign1: CampaignSummary, campaign2: CampaignSummary): CampaignComparison {
  const campaign1Rate = getQualifiedRate(campaign1);
  const campaign2Rate = getQualifiedRate(campaign2);

  if (campaign1Rate > campaign2Rate) {
    return { campaign1, campaign2, winner: "campaign1" };
  }
  if (campaign2Rate > campaign1Rate) {
    return { campaign1, campaign2, winner: "campaign2" };
  }
  return { campaign1, campaign2, winner: "equal" };
}

function ComparisonPanel({
  title,
  campaign,
  isWinner,
}: {
  title: string;
  campaign: CampaignSummary;
  isWinner: boolean;
}) {
  const leads = getLeadCounts(campaign);
  const qualifiedRate = getQualifiedRate(campaign);
  const avgScore = getAvgScore(campaign);
  const emailsSent = getEmailsSent(campaign);
  const status = String(campaign.status || "unknown").toLowerCase();

  return (
    <section
      className={`rounded-xl border bg-[#0b1525] p-4 ${
        isWinner ? "border-emerald-400/60 shadow-[0_0_0_1px_rgba(16,185,129,0.3)_inset]" : "border-white/10"
      }`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-blue-100">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-white/90">
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Niche</span>
          <br />
          <span className="font-semibold text-white">{campaign.niche || "Unknown niche"}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Pain keyword</span>
          <br />
          <span className="text-white/85">{campaign.pain_keyword || "N/A"}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Leads found / qualified</span>
          <br />
          <span className="font-semibold text-white">
            {leads.found} / {leads.qualified}
          </span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Qualified rate</span>
          <br />
          <span className="font-semibold text-white">{qualifiedRate.toFixed(1)}%</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Avg score</span>
          <br />
          <span className="font-semibold text-white">{formatAvgScore(avgScore)}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Emails sent</span>
          <br />
          <span className="font-semibold text-white">{emailsSent}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-muted">Status</span>
          <br />
          <span className="font-semibold text-white uppercase">{status}</span>
        </p>
      </div>
    </section>
  );
}

export default function CampaignHistory() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

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

  const recentCampaigns = useMemo(() => campaigns.slice(0, 3), [campaigns]);

  useEffect(() => {
    setSelectedJobIds((current) => {
      const next = current.filter((jobId) => recentCampaigns.some((campaign) => campaign.job_id === jobId));
      if (next.length === current.length && next.every((jobId, index) => jobId === current[index])) {
        return current;
      }
      return next.slice(0, 2);
    });
  }, [recentCampaigns]);

  const selectedCampaigns = useMemo(() => {
    return selectedJobIds
      .map((jobId) => recentCampaigns.find((campaign) => campaign.job_id === jobId))
      .filter((campaign): campaign is CampaignSummary => Boolean(campaign));
  }, [recentCampaigns, selectedJobIds]);

  const hasAnySelected = selectedCampaigns.length > 0;
  const canCompare = selectedCampaigns.length === 2;

  const comparison = useMemo(() => {
    if (!canCompare) {
      return null;
    }
    return buildComparison(selectedCampaigns[0], selectedCampaigns[1]);
  }, [canCompare, selectedCampaigns]);

  const winnerBanner = useMemo(() => {
    if (!comparison) {
      return "";
    }

    const campaign1Rate = getQualifiedRate(comparison.campaign1);
    const campaign2Rate = getQualifiedRate(comparison.campaign2);
    const delta = Math.abs(campaign1Rate - campaign2Rate);

    if (comparison.winner === "equal") {
      return "Equal performance";
    }

    if (comparison.winner === "campaign1") {
      return `Campaign 1 performed ${delta.toFixed(1)}% better`;
    }

    return `Campaign 2 performed ${delta.toFixed(1)}% better`;
  }, [comparison]);

  useEffect(() => {
    if (selectedCampaigns.length < 2) {
      setIsCompareOpen(false);
    }
  }, [selectedCampaigns.length]);

  function toggleCampaignSelection(jobId: string): void {
    setSelectedJobIds((current) => {
      if (current.includes(jobId)) {
        return current.filter((id) => id !== jobId);
      }

      if (current.length >= 2) {
        return current;
      }

      return [...current, jobId];
    });
  }

  const checkboxVisibilityClass = hasAnySelected
    ? "opacity-100"
    : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100";

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
          const isChecked = selectedJobIds.includes(campaign.job_id);

          return (
            <button
              key={campaign.job_id}
              type="button"
              onClick={() => router.push(`/hunt/${campaign.job_id}`)}
              className="group w-[88%] shrink-0 snap-start rounded-xl border border-white/10 bg-panel px-4 py-3 text-left transition hover:border-accent/40 hover:bg-panel-elevated sm:w-full sm:shrink"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-white">{campaign.niche || "Unknown niche"}</p>
                  <p className="mt-1 text-sm text-muted">
                    Pain keyword: <span className="text-white/85">{campaign.pain_keyword || "N/A"}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className={`inline-flex cursor-pointer items-center transition-opacity ${checkboxVisibilityClass}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleCampaignSelection(campaign.job_id);
                      }}
                      className="h-4 w-4 cursor-pointer rounded border border-[#1e8dff] accent-[#1e8dff]"
                    />
                  </label>
                  <span
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(status)}`}
                  >
                    {status}
                  </span>
                </div>
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

      <div className="pt-1">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-sm font-semibold text-accent transition hover:text-blue-300"
        >
          View all →
        </Link>
      </div>

      {canCompare ? (
        <button
          type="button"
          onClick={() => setIsCompareOpen(true)}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#1e8dff] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(30,141,255,0.45)] transition hover:bg-[#3b9dff]"
        >
          Compare 2 Campaigns →
        </button>
      ) : null}

      {isCompareOpen && comparison ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000000cc] p-4">
          <div className="w-full max-w-5xl rounded-2xl border border-white/15 bg-[#070f1d] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.7)] md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white md:text-2xl">Campaign Comparison</h2>
              <button
                type="button"
                onClick={() => setIsCompareOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-sm font-semibold text-white/85 transition hover:border-white/50 hover:text-white"
                aria-label="Close comparison"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ComparisonPanel
                title="Campaign 1"
                campaign={comparison.campaign1}
                isWinner={comparison.winner === "campaign1"}
              />
              <ComparisonPanel
                title="Campaign 2"
                campaign={comparison.campaign2}
                isWinner={comparison.winner === "campaign2"}
              />
            </div>

            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
                comparison.winner === "equal"
                  ? "border-white/20 bg-white/5 text-white"
                  : "border-emerald-400/50 bg-emerald-500/12 text-emerald-100"
              }`}
            >
              {winnerBanner}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
