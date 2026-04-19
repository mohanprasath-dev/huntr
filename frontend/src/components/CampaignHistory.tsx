"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { HUNTR_API_BASE_URL, getCampaignHistory } from "@/lib/huntr-api";
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
    return "border-[#bbf7d0] bg-[#dcfce7] text-[#166534]";
  }
  if (status === "failed") {
    return "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]";
  }
  if (status === "running") {
    return "animate-pulse border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }
  if (status === "stopped") {
    return "border-[#fde68a] bg-[#fefce8] text-[#854d0e]";
  }
  return "border-[#e5e7eb] bg-[#f3f4f6] text-[#6b7280]";
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
      className={`rounded-xl border bg-white p-4 ${
        isWinner ? "border-[#16a34a] shadow-[0_0_0_1px_rgba(22,163,74,0.2)_inset]" : "border-[#e5e7eb]"
      }`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#111827]">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-[#374151]">
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Niche</span>
          <br />
          <span className="font-semibold text-[#111827]">{campaign.niche || "Unknown niche"}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Pain keyword</span>
          <br />
          <span className="text-[#374151]">{campaign.pain_keyword || "N/A"}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Leads found / qualified</span>
          <br />
          <span className="font-semibold text-[#111827]">
            {leads.found} / {leads.qualified}
          </span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Qualified rate</span>
          <br />
          <span className="font-semibold text-[#111827]">{qualifiedRate.toFixed(1)}%</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Avg score</span>
          <br />
          <span className="font-semibold text-[#111827]">{formatAvgScore(avgScore)}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Emails sent</span>
          <br />
          <span className="font-semibold text-[#111827]">{emailsSent}</span>
        </p>
        <p>
          <span className="text-xs uppercase tracking-widest text-[#9ca3af]">Status</span>
          <br />
          <span className="font-semibold text-[#111827] uppercase">{status}</span>
        </p>
      </div>
    </section>
  );
}

interface CampaignHistoryProps {
  showViewAllLink?: boolean;
}

export default function CampaignHistory({ showViewAllLink = true }: CampaignHistoryProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCampaigns = async (): Promise<void> => {
      console.log("[CampaignHistory] Loading campaign history from", HUNTR_API_BASE_URL);

      try {
        const allCampaigns = await getCampaignHistory();
        console.log("[CampaignHistory] getCampaignHistory response", allCampaigns);

        if (!isMounted) {
          return;
        }

        const normalizedCampaigns = Array.isArray(allCampaigns) ? allCampaigns : [];
        setCampaigns(normalizedCampaigns);

        if (normalizedCampaigns.length === 0) {
          setError(
            `No campaigns returned from ${HUNTR_API_BASE_URL}/campaigns. Check backend Firestore logs.`,
          );
        } else {
          setError("");
        }
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        console.error("[CampaignHistory] Failed to load campaign history", loadError);
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
        <div className="h-28 w-[88%] shrink-0 animate-pulse rounded-xl border border-[#e5e7eb] bg-white sm:w-full sm:shrink" />
        <div className="h-28 w-[88%] shrink-0 animate-pulse rounded-xl border border-[#e5e7eb] bg-white sm:w-full sm:shrink" />
      </div>
    );
  }

  if (recentCampaigns.length === 0) {
    return (
      <p
        className={`rounded-xl border bg-white px-4 py-5 text-sm ${
          error
            ? "border-[#fde68a] text-[#854d0e]"
            : "border-[#e5e7eb] text-[#6b7280]"
        }`}
      >
        {error || "No campaigns yet. Start your first hunt above."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl border border-[#fde68a] bg-[#fefce8] px-4 py-3 text-sm text-[#854d0e]">
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
              onClick={() => router.push(`/app/hunt/${campaign.job_id}`)}
              className="group w-[88%] shrink-0 snap-start rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left transition hover:border-[#0066ff] hover:bg-[#f9fafb] sm:w-full sm:shrink"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-[#111827]">{campaign.niche || "Unknown niche"}</p>
                  <p className="mt-1 text-sm text-[#6b7280]">
                    Pain keyword: <span className="text-[#374151]">{campaign.pain_keyword || "N/A"}</span>
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
                <p className="text-[#374151]">
                  Leads found: <span className="font-semibold text-[#111827]">{leadsFound}</span>
                </p>
                <p className="text-[#374151]">
                  Qualified: <span className="font-semibold text-[#111827]">{leadsQualified}</span>
                </p>
                <p className="text-[#6b7280]">{formatTimeAgo(campaign.created_at ?? null)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {showViewAllLink ? (
        <div className="pt-1">
          <Link
            href="/app/campaigns"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0066ff] transition hover:text-[#0052cc]"
          >
            View all →
          </Link>
        </div>
      ) : null}

      {canCompare ? (
        <button
          type="button"
          onClick={() => setIsCompareOpen(true)}
          className="fixed bottom-6 left-1/2 z-40 min-h-11 -translate-x-1/2 rounded-full bg-[#0066ff] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,102,255,0.28)] transition hover:bg-[#0052cc]"
        >
          Compare 2 Campaigns →
        </button>
      ) : null}

      {isCompareOpen && comparison ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#11182766] p-0 sm:items-center sm:p-4">
          <div className="h-screen w-screen overflow-y-auto rounded-none border-0 bg-white p-4 shadow-none sm:h-auto sm:w-full sm:max-w-5xl sm:rounded-2xl sm:border sm:border-[#e5e7eb] sm:p-5 sm:shadow-[0_24px_80px_rgba(17,24,39,0.28)] md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[#111827] md:text-2xl">Campaign Comparison</h2>
              <button
                type="button"
                onClick={() => setIsCompareOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] transition hover:border-[#9ca3af] hover:text-[#374151]"
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
                  ? "border-[#e5e7eb] bg-[#f9fafb] text-[#374151]"
                  : "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
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
