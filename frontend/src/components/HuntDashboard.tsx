"use client";

import { useEffect, useMemo, useState } from "react";

import AgentPipeline from "@/components/AgentPipeline";
import LeadCard from "@/components/LeadCard";
import StatsBar from "@/components/StatsBar";
import { getJobLeads, getJobStatus } from "@/lib/huntr-api";
import type { JobStatusResponse, Lead } from "@/lib/huntr-types";

interface HuntDashboardProps {
  jobId: string;
}

type LeadSource = "LinkedIn" | "Reddit" | "Twitter";
type ScoreRangeFilter = "all" | "90-100" | "70-89" | "60-69" | "below-60";

interface LeadWithMeta {
  lead: Lead;
  leadId: number;
  source: LeadSource;
  score: number;
  emailReady: boolean;
}

const ABOVE_THRESHOLD_SCORE = 70;

function deriveLeadSource(lead: Lead): LeadSource {
  const explicitSource = String(lead.source || "").toLowerCase();
  if (explicitSource.includes("reddit")) {
    return "Reddit";
  }
  if (explicitSource.includes("twitter") || explicitSource.includes("x.com")) {
    return "Twitter";
  }
  if (explicitSource.includes("linkedin")) {
    return "LinkedIn";
  }

  const signal = `${lead.company} ${lead.decision_maker} ${lead.linkedin_draft}`.toLowerCase();
  if (signal.includes("reddit")) {
    return "Reddit";
  }
  if (signal.includes("twitter") || signal.includes("x.com")) {
    return "Twitter";
  }

  return "LinkedIn";
}

function isEmailReady(lead: Lead): boolean {
  return Boolean(lead.email_draft?.subject?.trim()) && Boolean(lead.email_draft?.body?.trim());
}

function matchesScoreRange(score: number, range: ScoreRangeFilter): boolean {
  if (range === "90-100") {
    return score >= 90;
  }
  if (range === "70-89") {
    return score >= 70 && score <= 89;
  }
  if (range === "60-69") {
    return score >= 60 && score <= 69;
  }
  if (range === "below-60") {
    return score < 60;
  }
  return true;
}

function statusTone(status: string): string {
  if (status === "completed") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "failed") {
    return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  }
  if (status === "running") {
    return "border-accent/40 bg-accent/15 text-blue-100";
  }
  return "border-white/20 bg-white/5 text-white/80";
}

export default function HuntDashboard({ jobId }: HuntDashboardProps) {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sentLeadIds, setSentLeadIds] = useState<number[]>([]);
  const [scoreFilter, setScoreFilter] = useState<ScoreRangeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | LeadSource>("all");
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async (): Promise<void> => {
      try {
        const [nextStatus, nextLeads] = await Promise.all([
          getJobStatus(jobId),
          getJobLeads(jobId),
        ]);

        if (!isMounted) {
          return;
        }

        setStatus(nextStatus);
        setLeads(nextLeads.leads ?? []);
        setError("");

        const pollDelay =
          nextStatus.status === "completed" || nextStatus.status === "failed" ? 4500 : 1800;
        nextTimer = setTimeout(refresh, pollDelay);
      } catch (refreshError) {
        if (!isMounted) {
          return;
        }

        const detail =
          refreshError instanceof Error
            ? refreshError.message
            : "Unable to refresh job status.";
        setError(detail);
        nextTimer = setTimeout(refresh, 3000);
      } finally {
        if (isMounted) {
          setIsInitialLoading(false);
        }
      }
    };

    refresh();

    return () => {
      isMounted = false;
      if (nextTimer) {
        clearTimeout(nextTimer);
      }
    };
  }, [jobId]);

  const processedLeads = useMemo<LeadWithMeta[]>(() => {
    return leads
      .map((lead, leadId) => ({
        lead,
        leadId,
        source: deriveLeadSource(lead),
        score: Number(lead.score) || 0,
        emailReady: isEmailReady(lead),
      }))
      .sort((first, second) => second.score - first.score);
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return processedLeads.filter((item) => {
      const scorePass = matchesScoreRange(item.score, scoreFilter);
      const sourcePass = sourceFilter === "all" ? true : item.source === sourceFilter;
      return scorePass && sourcePass;
    });
  }, [processedLeads, scoreFilter, sourceFilter]);

  const leadsFoundCount = Math.max(status?.leads_found ?? 0, leads.length);
  const aboveThresholdCount = processedLeads.filter((item) => item.score >= ABOVE_THRESHOLD_SCORE).length;
  const readyToSendCount = processedLeads.filter(
    (item) => item.emailReady && !sentLeadIds.includes(item.leadId),
  ).length;

  const emailsReady = processedLeads.filter((item) => item.emailReady).length;

  function handleLeadSent(leadId: number): void {
    setSentLeadIds((current) => {
      if (current.includes(leadId)) {
        return current;
      }
      return [...current, leadId];
    });
  }

  const statusLabel = String(status?.status ?? (isInitialLoading ? "loading" : "unknown"));
  const activeFilterCount = Number(scoreFilter !== "all") + Number(sourceFilter !== "all");

  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 pb-12 pt-8 md:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Hunt Session</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Live Leads Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted">Job ID: {jobId}</p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusTone(statusLabel)}`}
        >
          {statusLabel}
        </span>
      </header>

      <section className="mb-6 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-blue-100 shadow-[0_0_0_1px_rgba(0,102,255,0.2)_inset] md:px-5">
        <p className="font-medium">
          <span className="font-semibold text-white">{leadsFoundCount}</span> leads found,
          <span className="ml-1 font-semibold text-white">{aboveThresholdCount}</span> above threshold,
          <span className="ml-1 font-semibold text-white">{readyToSendCount}</span> ready to send
        </p>
      </section>

      <StatsBar
        leadsFound={status?.leads_found ?? 0}
        leadsScored={status?.leads_scored ?? 0}
        emailsReady={emailsReady}
        sentCount={sentLeadIds.length}
      />

      <div className="mt-6">
        <AgentPipeline jobId={jobId} />
      </div>

      {error ? (
        <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="mt-6 space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-panel p-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Qualified Leads</h2>
            <p className="mt-1 text-sm text-muted">
              Sorted by score descending. Filter by score range and source.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-muted">Score Range</span>
              <select
                value={scoreFilter}
                onChange={(event) => setScoreFilter(event.target.value as ScoreRangeFilter)}
                className="mt-2 h-10 rounded-lg border border-white/15 bg-panel-elevated px-3 text-sm text-white outline-none transition-colors focus:border-accent"
              >
                <option value="all">All Scores</option>
                <option value="90-100">90-100</option>
                <option value="70-89">70-89</option>
                <option value="60-69">60-69</option>
                <option value="below-60">Below 60</option>
              </select>
            </label>

            <label>
              <span className="text-xs uppercase tracking-[0.16em] text-muted">Source</span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as "all" | LeadSource)}
                className="mt-2 h-10 rounded-lg border border-white/15 bg-panel-elevated px-3 text-sm text-white outline-none transition-colors focus:border-accent"
              >
                <option value="all">All Sources</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Reddit">Reddit</option>
                <option value="Twitter">Twitter</option>
              </select>
            </label>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setScoreFilter("all");
                  setSourceFilter("all");
                }}
                className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Reset Filters
              </button>
            ) : null}
          </div>
        </div>

        {isInitialLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/3" />
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/3" />
          </div>
        ) : processedLeads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-panel p-6 text-sm text-muted">
            Leads will appear here as the run progresses.
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-panel p-6 text-sm text-muted">
            No leads match the current filters.
          </div>
        ) : (
          <div className="grid gap-5">
            {filteredLeads.map((item) => (
              <LeadCard
                key={`${item.lead.company}-${item.leadId}`}
                jobId={jobId}
                leadId={item.leadId}
                lead={item.lead}
                alreadySent={sentLeadIds.includes(item.leadId)}
                onSent={handleLeadSent}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


