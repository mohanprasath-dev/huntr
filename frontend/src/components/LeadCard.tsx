"use client";

import { useEffect, useMemo, useState } from "react";

import FollowupTimeline from "@/components/FollowupTimeline";
import { getTrackingStatus, sendLead } from "@/lib/huntr-api";
import type { Lead } from "@/lib/huntr-types";

interface LeadCardProps {
  jobId: string;
  leadId: number;
  lead: Lead;
  alreadySent: boolean;
  onSent: (leadId: number) => void;
}

const TRACKING_POLL_INTERVAL_MS = 5_000;
const TRACKING_POLL_MAX_MS = 10 * 60 * 1_000;

function getScoreTone(score: number): string {
  if (score >= 90) {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (score >= 70) {
    return "border-accent/50 bg-accent/15 text-blue-100";
  }
  if (score >= 60) {
    return "border-amber-400/40 bg-amber-500/10 text-amber-100";
  }
  return "border-rose-400/40 bg-rose-500/10 text-rose-100";
}

function deriveCompanySize(lead: Lead): string {
  const directSize =
    lead.company_size ??
    lead.companySize ??
    lead.size ??
    lead.org_size ??
    lead.company_profile?.size;

  if (typeof directSize === "string" && directSize.trim()) {
    return directSize.trim();
  }

  const score = Number(lead.score) || 0;
  if (score >= 90) {
    return "500+ employees";
  }
  if (score >= 70) {
    return "100-500 employees";
  }
  if (score >= 60) {
    return "20-100 employees";
  }
  return "<20 employees";
}

function parseDecisionMaker(lead: Lead): { name: string; title: string } {
  const providedTitle = lead.decision_maker_title ?? lead.decisionMakerTitle;
  const raw = String(lead.decision_maker || "").trim();

  if (providedTitle && providedTitle.trim()) {
    return {
      name: raw || "Unknown Decision Maker",
      title: providedTitle.trim(),
    };
  }

  for (const delimiter of [" - ", " | ", " — "]) {
    if (raw.includes(delimiter)) {
      const [name, title] = raw.split(delimiter);
      if (name?.trim()) {
        return {
          name: name.trim(),
          title: title?.trim() || "Title unavailable",
        };
      }
    }
  }

  const cleaned = raw.replace(/\(.*?\)/g, "").trim();
  return {
    name: cleaned || raw || "Unknown Decision Maker",
    title: "Title unavailable",
  };
}

function derivePainPoint(lead: Lead): string {
  const explicitPain = lead.pain_point ?? lead.painPoint;
  if (typeof explicitPain === "string" && explicitPain.trim()) {
    return explicitPain.trim();
  }

  const emailBody = String(lead.email_draft?.body || "");
  const emailSubject = String(lead.email_draft?.subject || "");

  const dragMatch = emailBody.match(/looks\s+like\s+(.+?)\s+is\s+creating\s+drag/i);
  if (dragMatch?.[1]) {
    return dragMatch[1].replace(/\s+/g, " ").trim();
  }

  const fixMatch = emailSubject.match(/fixing\s+(.+)/i);
  if (fixMatch?.[1]) {
    return fixMatch[1].replace(/[.:]+$/, "").trim();
  }

  const normalized = emailBody.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No specific pain point detected from this lead yet.";
  }

  const sentence = normalized.split(".")[0]?.trim() || normalized;
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

function deriveLeadSource(lead: Lead): "LinkedIn" | "Reddit" | "Twitter" {
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

function formatOpenedAgo(openedAtIso: string, nowMs: number): string {
  const openedMs = Date.parse(openedAtIso);
  if (Number.isNaN(openedMs)) {
    return "Opened just now";
  }

  const seconds = Math.max(0, Math.floor((nowMs - openedMs) / 1_000));
  if (seconds < 60) {
    if (seconds <= 5) {
      return "Opened just now";
    }
    return `Opened ${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Opened ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Opened ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `Opened ${days} day${days === 1 ? "" : "s"} ago`;
}

export default function LeadCard({
  jobId,
  leadId,
  lead,
  alreadySent,
  onSent,
}: LeadCardProps) {
  const [recipient, setRecipient] = useState("");
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [linkedinExpanded, setLinkedinExpanded] = useState(false);
  const [showFollowups, setShowFollowups] = useState(false);
  const [emailSubject, setEmailSubject] = useState(lead.email_draft?.subject || "");
  const [emailBody, setEmailBody] = useState(lead.email_draft?.body || "");
  const [linkedinMessage, setLinkedinMessage] = useState(lead.linkedin_draft || "");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">(
    alreadySent ? "sent" : "idle",
  );
  const [sendMessage, setSendMessage] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [copyMessage, setCopyMessage] = useState("");
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [trackingState, setTrackingState] = useState<"idle" | "polling" | "opened" | "expired">(
    "idle",
  );
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [openedBannerFlash, setOpenedBannerFlash] = useState(false);
  const [openedClockTick, setOpenedClockTick] = useState(() => Date.now());

  useEffect(() => {
    setEmailSubject(lead.email_draft?.subject || "");
    setEmailBody(lead.email_draft?.body || "");
    setLinkedinMessage(lead.linkedin_draft || "");
  }, [lead]);

  useEffect(() => {
    if (alreadySent) {
      setSendState("sent");
    }
  }, [alreadySent]);

  useEffect(() => {
    if (!trackingId || trackingState !== "polling") {
      return;
    }

    let disposed = false;
    let inFlight = false;
    const startedAtMs = Date.now();

    const pollTrackingStatus = async (): Promise<void> => {
      if (disposed || inFlight) {
        return;
      }

      if (Date.now() - startedAtMs >= TRACKING_POLL_MAX_MS) {
        setTrackingState((current) => (current === "polling" ? "expired" : current));
        return;
      }

      inFlight = true;
      try {
        const status = await getTrackingStatus(trackingId);
        if (disposed) {
          return;
        }

        if (status.opened) {
          setOpenedAt(status.opened_at ?? new Date().toISOString());
          setTrackingState("opened");
          setOpenedBannerFlash(true);
        }
      } catch {
        // Keep polling for the full window; transient errors should not break the demo flow.
      } finally {
        inFlight = false;
      }
    };

    void pollTrackingStatus();

    const intervalId = window.setInterval(() => {
      void pollTrackingStatus();
    }, TRACKING_POLL_INTERVAL_MS);

    const timeoutId = window.setTimeout(() => {
      setTrackingState((current) => (current === "polling" ? "expired" : current));
    }, TRACKING_POLL_MAX_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [trackingId, trackingState]);

  useEffect(() => {
    if (!openedBannerFlash) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setOpenedBannerFlash(false);
    }, 7_000);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [openedBannerFlash]);

  useEffect(() => {
    if (trackingState !== "opened") {
      return;
    }

    setOpenedClockTick(Date.now());
    const timerId = window.setInterval(() => {
      setOpenedClockTick(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [trackingState]);

  const scoreTone = useMemo(() => getScoreTone(Number(lead.score) || 0), [lead.score]);
  const companySize = useMemo(() => deriveCompanySize(lead), [lead]);
  const decisionMaker = useMemo(() => parseDecisionMaker(lead), [lead]);
  const painPoint = useMemo(() => derivePainPoint(lead), [lead]);
  const source = useMemo(() => deriveLeadSource(lead), [lead]);
  const emailReady = Boolean(emailSubject.trim()) && Boolean(emailBody.trim());
  const openedRelativeTime = useMemo(() => {
    if (!openedAt) {
      return "";
    }
    return formatOpenedAgo(openedAt, openedClockTick);
  }, [openedAt, openedClockTick]);

  async function handleSend(): Promise<void> {
    setSendState("sending");
    setSendMessage("");
    setTrackingId(null);
    setTrackingState("idle");
    setOpenedAt(null);
    setOpenedBannerFlash(false);

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

      const trackedId = typeof response.tracking_id === "string" ? response.tracking_id : "";
      if (trackedId) {
        setTrackingId(trackedId);
        setTrackingState("polling");
      }

      onSent(leadId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown send error.";
      setSendState("error");
      setSendMessage(detail);
    }
  }

  async function handleCopyLinkedin(): Promise<void> {
    try {
      await navigator.clipboard.writeText(linkedinMessage.trim());
      setCopyState("copied");
      setCopyMessage("LinkedIn message copied.");
    } catch {
      setCopyState("error");
      setCopyMessage("Clipboard copy failed. Copy manually from the editor.");
    }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-panel p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{lead.company}</h3>
          <p className="mt-1 text-sm text-muted">Size: {companySize}</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${scoreTone}`}>
          Score {lead.score}
        </div>
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Decision Maker</p>
          <p className="mt-2 text-sm font-semibold text-white">{decisionMaker.name}</p>
          <p className="mt-1 text-sm text-muted">{decisionMaker.title}</p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Pain Point Detected</p>
          <p className="mt-2 truncate text-sm text-foreground/90">{painPoint}</p>
          <p className="mt-2 text-xs text-muted">Source: {source}</p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Email Draft</p>
            <button
              type="button"
              onClick={() => setEmailExpanded((current) => !current)}
              className="text-xs font-medium text-accent hover:text-blue-200"
            >
              {emailExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {emailExpanded ? (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.15em] text-muted">Subject</span>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-panel-elevated px-3 py-2 text-sm text-white outline-none transition-colors focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.15em] text-muted">Body</span>
                <textarea
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  rows={9}
                  className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-panel-elevated px-3 py-2 text-sm leading-relaxed text-white outline-none transition-colors focus:border-accent"
                />
              </label>
            </div>
          ) : (
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {emailBody || "No email draft generated."}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/2 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">LinkedIn Message</p>
            <button
              type="button"
              onClick={() => setLinkedinExpanded((current) => !current)}
              className="text-xs font-medium text-accent hover:text-blue-200"
            >
              {linkedinExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {linkedinExpanded ? (
            <textarea
              value={linkedinMessage}
              onChange={(event) => setLinkedinMessage(event.target.value)}
              rows={9}
              className="mt-3 w-full resize-y rounded-lg border border-white/15 bg-panel-elevated px-3 py-2 text-sm leading-relaxed text-white outline-none transition-colors focus:border-accent"
            />
          ) : (
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {linkedinMessage || "No LinkedIn draft generated."}
            </p>
          )}
        </section>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/2 p-4">
        <button
          type="button"
          onClick={() => setShowFollowups((current) => !current)}
          className="text-xs font-semibold uppercase tracking-[0.16em] text-accent hover:text-blue-200"
        >
          {showFollowups ? "Hide Follow-up Timeline" : "Show Follow-up Timeline"}
        </button>

        {showFollowups ? (
          <div className="mt-3">
            <FollowupTimeline sequence={lead.followup_sequence ?? []} />
          </div>
        ) : null}
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
            {sendState === "sending"
              ? "Sending..."
              : sendState === "sent"
                ? "Sent"
                : "Approve & Send Email"}
          </button>

          <button
            type="button"
            onClick={handleCopyLinkedin}
            className="h-11 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Copy LinkedIn Message
          </button>
        </div>

        {sendMessage ? (
          <p className={`mt-3 text-sm ${sendState === "error" ? "text-rose-300" : "text-emerald-300"}`}>
            {sendMessage}
          </p>
        ) : null}

        {trackingState === "polling" ? (
          <p className="mt-3 text-sm text-blue-200">
            {"\uD83D\uDCE8 Email delivered \u2014 waiting for open..."}
          </p>
        ) : null}

        {trackingState === "opened" ? (
          <div
            className={`mt-3 rounded-lg border border-emerald-400/55 bg-emerald-500/18 px-3 py-2 text-emerald-50 ${
              openedBannerFlash ? "animate-pulse" : ""
            }`}
          >
            <p className="text-sm font-semibold">{"\uD83C\uDF89 Email opened!"}</p>
            <p className="mt-1 text-xs text-emerald-100">{openedRelativeTime || "Opened just now"}</p>
          </div>
        ) : null}

        {copyMessage ? (
          <p className={`mt-2 text-sm ${copyState === "error" ? "text-rose-300" : "text-blue-200"}`}>
            {copyMessage}
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


