import Link from "next/link";

import { getCampaignHistory } from "@/lib/huntr-api";
import type { CampaignSummary } from "@/lib/huntr-types";

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

export default async function CampaignsPage() {
  let campaigns: CampaignSummary[] = [];
  let errorMessage = "";

  try {
    const result = await getCampaignHistory(20);
    campaigns = Array.isArray(result) ? result.slice(0, 20) : [];
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to load campaign history.";
  }

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

      {campaigns.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-panel px-6 py-10 text-center">
          <p className="text-base text-muted">No campaigns yet. Start your first hunt.</p>
        </div>
      ) : (
        <section className="mt-8 space-y-4">
          <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-panel-elevated/60 backdrop-blur md:block">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.14em] text-muted">
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

                  return (
                    <tr key={campaign.job_id} className="border-b border-white/5 text-sm text-white/90 last:border-b-0">
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

              return (
                <article key={campaign.job_id} className="rounded-xl border border-white/10 bg-panel px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-white">{campaign.niche || "Unknown niche"}</h2>
                      <p className="mt-1 text-sm text-muted">{campaign.pain_keyword || "N/A"}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusBadgeClass(status)}`}
                    >
                      {status}
                    </span>
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
    </main>
  );
}
