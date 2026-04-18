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

  const emailsReady = useMemo(
    () =>
      leads.filter(
        (lead) =>
          Boolean(lead.email_draft?.subject?.trim()) && Boolean(lead.email_draft?.body?.trim()),
      ).length,
    [leads],
  );

  function handleLeadSent(leadId: number): void {
    setSentLeadIds((current) => {
      if (current.includes(leadId)) {
        return current;
      }
      return [...current, leadId];
    });
  }

  const statusLabel = String(status?.status ?? (isInitialLoading ? "loading" : "unknown"));

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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-xl font-semibold text-white">Qualified Leads</h2>
          <p className="text-sm text-muted">
            Review, approve, and send personalized outreach from a single control surface.
          </p>
        </div>

        {isInitialLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/3" />
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/3" />
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-panel p-6 text-sm text-muted">
            Leads will appear here as the run progresses.
          </div>
        ) : (
          <div className="grid gap-5">
            {leads.map((lead, index) => (
              <LeadCard
                key={`${lead.company}-${index}`}
                jobId={jobId}
                leadId={index}
                lead={lead}
                alreadySent={sentLeadIds.includes(index)}
                onSent={handleLeadSent}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


