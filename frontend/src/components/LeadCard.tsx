"use client";

import { useMemo, useState } from "react";

import FollowupTimeline from "@/components/FollowupTimeline";
import { sendLead } from "@/lib/huntr-api";
import type { Lead } from "@/lib/huntr-types";

interface LeadCardProps {
  jobId: string;
  leadId: number;
  lead: Lead;
  alreadySent: boolean;
  onSent: (leadId: number) => void;
}

function getScoreTone(score: number): string {
  if (score >= 75) {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (score >= 60) {
    return "border-accent/50 bg-accent/15 text-blue-100";
  }
  if (score >= 40) {
    return "border-amber-400/40 bg-amber-500/10 text-amber-100";
  }
  return "border-rose-400/40 bg-rose-500/10 text-rose-100";
}

export default function LeadCard({
  jobId,
  leadId,
  lead,
  alreadySent,
  onSent,
}: LeadCardProps) {
  const [recipient, setRecipient] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">(
    alreadySent ? "sent" : "idle",
  );
  const [sendMessage, setSendMessage] = useState("");

  const scoreTone = useMemo(() => getScoreTone(Number(lead.score) || 0), [lead.score]);
  const emailReady =
    Boolean(lead.email_draft?.subject?.trim()) && Boolean(lead.email_draft?.body?.trim());

  async function handleSend(): Promise<void> {
    setSendState("sending");
    setSendMessage("");

    try {
      const response = await sendLead(jobId, leadId, {
        approved: true,
        to_email: recipient.trim(),
      });

      const status = response.status.toLowerCase();
      const consideredSent = status !== "failed" && status !== "awaiting_approval";

      if (!consideredSent) {
        setSendState("error");
        setSendMessage(response.detail ?? "Send failed. Check recipient details and retry.");
        return;
      }

      setSendState("sent");
      setSendMessage(response.detail ?? `Queued with ${response.provider}.`);
      onSent(leadId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown send error.";
      setSendState("error");
      setSendMessage(detail);
    }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{lead.company}</h3>
          <p className="mt-1 text-sm text-muted">Decision Maker: {lead.decision_maker}</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${scoreTone}`}>
          Score {lead.score}
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Email Draft</p>
          <p className="mt-3 text-sm font-semibold text-accent">{lead.email_draft.subject || "No subject generated"}</p>
          <p className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {lead.email_draft.body || "No body generated."}
          </p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">LinkedIn Draft</p>
          <p className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {lead.linkedin_draft || "No LinkedIn draft generated."}
          </p>
        </section>
      </div>

      <div className="mt-4">
        <FollowupTimeline sequence={lead.followup_sequence ?? []} />
      </div>

      <footer className="mt-4 rounded-xl border border-white/10 bg-white/2 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">Recipient Email</span>
            <input
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="decisionmaker@company.com"
              className="mt-2 w-full rounded-lg border border-white/15 bg-panel-elevated px-3 py-2 text-sm text-white outline-none transition-colors focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={handleSend}
            disabled={sendState === "sending" || sendState === "sent" || !emailReady}
            className="h-11 rounded-lg border border-accent/60 bg-accent px-4 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] transition hover:bg-[#2f7dff] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {sendState === "sending" ? "Sending..." : sendState === "sent" ? "Sent" : "Approve & Send"}
          </button>
        </div>

        {sendMessage ? (
          <p className={`mt-3 text-sm ${sendState === "error" ? "text-rose-300" : "text-emerald-300"}`}>
            {sendMessage}
          </p>
        ) : null}

        {!emailReady ? (
          <p className="mt-3 text-xs text-amber-200">
            Draft missing subject/body. This lead cannot be sent yet.
          </p>
        ) : null}
      </footer>
    </article>
  );
}


