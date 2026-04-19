"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getCampaignHistory } from "@/lib/huntr-api";
import type { CampaignComparison, CampaignSummary } from "@/lib/huntr-types";

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
  if (status === "stopped") {
    return "border-amber-400/45 bg-amber-500/10 text-amber-100";
  }

  return "border-white/20 bg-white/5 text-white/80";
}

function formatDate(createdAt: string | null | undefined): string {
  if (!createdAt) {
    return "Unknown";
  }

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCampaigns = async (): Promise<void> => {
      try {
        const result = await getCampaignHistory(20);
        if (!isMounted) {
          return;
        }
        setCampaigns(Array.isArray(result) ? result.slice(0, 20) : []);
        setErrorMessage("");
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const detail = error instanceof Error ? error.message : "Unable to load campaign history.";
        setErrorMessage(detail);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadCampaigns();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setSelectedJobIds((current) => {
      const next = current.filter((jobId) => campaigns.some((campaign) => campaign.job_id === jobId));
      if (next.length === current.length && next.every((jobId, index) => jobId === current[index])) {
        return current;
      }
      return next.slice(0, 2);
    });
  }, [campaigns]);

  const selectedCampaigns = useMemo(() => {
    return selectedJobIds
      .map((jobId) => campaigns.find((campaign) => campaign.job_id === jobId))
      .filter((campaign): campaign is CampaignSummary => Boolean(campaign));
  }, [campaigns, selectedJobIds]);

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
    : "opacity-100 md:opacity-0 md:group-hover:opacity-100";

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-2xl px-4 pb-12 pt-8 md:px-8 md:pt-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">Campaign History</h1>
          <p className="mt-2 text-sm text-muted md:text-base">All past hunts with outcomes</p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:border-accent hover:bg-accent/20 hover:text-white"
        >
          New Hunt →
        </Link>
      </section>

      {errorMessage ? (
        <p className="mt-6 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-panel px-6 py-10 text-center">
          <p className="text-base text-muted">Loading campaigns...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-panel px-6 py-10 text-center">
          <p className="text-base text-muted">No campaigns yet. Start your first hunt.</p>
        </div>
      ) : (
        <section className="mt-8 space-y-4">
          <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-panel-elevated/60 backdrop-blur md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.14em] text-muted">
                  <th className="w-12 px-4 py-3 font-semibold">&nbsp;</th>
                  <th className="px-4 py-3 font-semibold">Niche</th>
                  <th className="px-4 py-3 font-semibold">Pain keyword</th>
                  <th className="px-4 py-3 font-semibold">Leads found / qualified</th>
                  <th className="px-4 py-3 font-semibold">Avg score</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const status = String(campaign.status || "unknown").toLowerCase();
                  const leads = getLeadCounts(campaign);
                  const avgScore = getAvgScore(campaign);
                  const isChecked = selectedJobIds.includes(campaign.job_id);

                  return (
                    <tr
                      key={campaign.job_id}
                      className="group border-b border-white/5 text-sm text-white/90 last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <label className={`inline-flex cursor-pointer items-center transition-opacity ${checkboxVisibilityClass}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCampaignSelection(campaign.job_id)}
                            className="h-4 w-4 cursor-pointer rounded border border-[#1e8dff] accent-[#1e8dff]"
                          />
                        </label>
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{campaign.niche || "Unknown niche"}</td>
                      <td className="px-4 py-3 text-white/80">{campaign.pain_keyword || "N/A"}</td>
                      <td className="px-4 py-3 font-medium text-white">
                        {leads.found} / {leads.qualified}
                      </td>
                      <td className="px-4 py-3">{formatAvgScore(avgScore)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusBadgeClass(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/75">{formatDate(campaign.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/hunt/${campaign.job_id}`}
                          className="inline-flex items-center font-semibold text-accent transition hover:text-blue-300"
                        >
                          View Results →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {campaigns.map((campaign) => {
              const status = String(campaign.status || "unknown").toLowerCase();
              const leads = getLeadCounts(campaign);
              const avgScore = getAvgScore(campaign);
              const isChecked = selectedJobIds.includes(campaign.job_id);

              return (
                <article key={campaign.job_id} className="group rounded-xl border border-white/10 bg-panel px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-white">{campaign.niche || "Unknown niche"}</h2>
                      <p className="mt-1 text-sm text-muted">{campaign.pain_keyword || "N/A"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className={`inline-flex cursor-pointer items-center transition-opacity ${checkboxVisibilityClass}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCampaignSelection(campaign.job_id)}
                          className="h-4 w-4 cursor-pointer rounded border border-[#1e8dff] accent-[#1e8dff]"
                        />
                      </label>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusBadgeClass(status)}`}
                      >
                        {status}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <p className="text-white/85">Leads: {leads.found} / {leads.qualified}</p>
                    <p className="text-white/85">Avg score: {formatAvgScore(avgScore)}</p>
                    <p className="text-muted">Date: {formatDate(campaign.created_at)}</p>
                  </div>

                  <div className="mt-3">
                    <Link
                      href={`/hunt/${campaign.job_id}`}
                      className="inline-flex items-center text-sm font-semibold text-accent transition hover:text-blue-300"
                    >
                      View Results →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

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
    </main>
  );
}
