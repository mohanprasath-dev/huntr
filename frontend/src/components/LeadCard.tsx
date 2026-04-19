"use client";

import { useEffect, useMemo, useState } from "react";

import FollowupTimeline from "@/components/FollowupTimeline";
import { getTrackingStatus, sendLead } from "@/lib/huntr-api";
import type { Lead } from "@/lib/huntr-types";

interface LeadCardProps {
  jobId: string;
  leadId: number;
  lead: Lead;
  cardIndex?: number;
  alreadySent: boolean;
  onSent: (leadId: number) => void;
}

const TRACKING_POLL_INTERVAL_MS = 5_000;
const TRACKING_POLL_MAX_MS = 10 * 60 * 1_000;

function getScoreTone(score: number): string {
  if (score >= 90) {
    return "border-[#bbf7d0] bg-[#dcfce7] text-[#166534]";
  }
  if (score >= 70) {
    return "border-[#bfdbfe] bg-[#dbeafe] text-[#1d4ed8]";
  }
  if (score >= 60) {
    return "border-[#fde68a] bg-[#fef9c3] text-[#854d0e]";
  }
  return "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]";
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
  const normalizedProvidedTitle =
    typeof providedTitle === "string" ? providedTitle.trim() : "";

  const isRealTitle = (value: string): boolean => {
    const normalized = value.trim().toLowerCase();
    return ![
      "",
      "unavailable",
      "title unavailable",
      "unknown",
      "unknown title",
    ].includes(normalized);
  };

  if (normalizedProvidedTitle && isRealTitle(normalizedProvidedTitle)) {
    return {
      name: raw || "Unknown Decision Maker",
      title: normalizedProvidedTitle,
    };
  }

  for (const delimiter of [" - ", " | ", " — "]) {
    if (raw.includes(delimiter)) {
      const [name, title] = raw.split(delimiter);
      if (name?.trim()) {
        const normalizedTitle = title?.trim() || "";
        return {
          name: name.trim(),
          title: isRealTitle(normalizedTitle) ? normalizedTitle : "",
        };
      }
    }
  }

  const cleaned = raw.replace(/\(.*?\)/g, "").trim();
  return {
    name: cleaned || raw || "Unknown Decision Maker",
    title: "",
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

function deriveRecipientEmailHint(lead: Lead): string {
  const leadWithEmailHint = lead as Lead & {
    email_hint?: string | null;
    emailHint?: string | null;
  };

  const hint = leadWithEmailHint.email_hint ?? leadWithEmailHint.emailHint;
  if (typeof hint !== "string") {
    return "";
  }

  const trimmedHint = hint.trim();
  return trimmedHint || "";
}

function deriveCompanyDisplay(lead: Lead): {
  label: "COMPANY" | "SOURCE";
  displayName: string;
  isSourceLike: boolean;
} {
  const rawCompanyName = String(lead.company || "").trim();
  const companyName = rawCompanyName || "Unknown Company";
  const isSourceLike = /http/i.test(companyName) || /^\d+\s/.test(companyName);
  const displayName =
    companyName.length > 50 ? `${companyName.slice(0, 50)}...` : companyName;

  return {
    label: isSourceLike ? "SOURCE" : "COMPANY",
    displayName,
    isSourceLike,
  };
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

function deriveLinkedinUrl(lead: Lead): string {
  const withLinkedin = lead as Lead & {
    linkedin_url?: string | null;
    linkedinUrl?: string | null;
  };

  const raw = withLinkedin.linkedin_url ?? withLinkedin.linkedinUrl;
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
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
  cardIndex = 0,
  alreadySent,
  onSent,
}: LeadCardProps) {
  const [recipient, setRecipient] = useState(() => deriveRecipientEmailHint(lead));
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
  const [animatedScore, setAnimatedScore] = useState(0);
  const [scoreArcProgress, setScoreArcProgress] = useState(0);

  const numericScore = Number(lead.score) || 0;
  const targetArcProgress = Math.max(0, Math.min(100, numericScore)) / 100;
  const scoreRingRadius = 18;
  const scoreRingCircumference = 2 * Math.PI * scoreRingRadius;
  const scoreStrokeOffset = scoreRingCircumference * (1 - scoreArcProgress);
  const cardDelayMs = Math.max(0, cardIndex) * 100;
  const isPipelineStageActive = sendState === "sending" || trackingState === "polling";

  useEffect(() => {
    setRecipient(deriveRecipientEmailHint(lead));
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

  useEffect(() => {
    const durationMs = 800;
    let rafId = 0;
    let startTime: number | null = null;

    setAnimatedScore(0);
    setScoreArcProgress(0);

    const animate = (timestamp: number): void => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsedMs = timestamp - startTime;
      const progress = Math.min(1, elapsedMs / durationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setAnimatedScore(Math.round(numericScore * easedProgress));
      setScoreArcProgress(targetArcProgress * easedProgress);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(animate);
        return;
      }

      setAnimatedScore(Math.round(numericScore));
      setScoreArcProgress(targetArcProgress);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [leadId, numericScore, targetArcProgress]);

  const scoreTone = useMemo(() => getScoreTone(numericScore), [numericScore]);
  const companySize = useMemo(() => deriveCompanySize(lead), [lead]);
  const companyDisplay = useMemo(() => deriveCompanyDisplay(lead), [lead]);
  const decisionMaker = useMemo(() => parseDecisionMaker(lead), [lead]);
  const painPoint = useMemo(() => derivePainPoint(lead), [lead]);
  const source = useMemo(() => deriveLeadSource(lead), [lead]);
  const linkedinUrl = useMemo(() => deriveLinkedinUrl(lead), [lead]);
  const leadEmailHint = useMemo(() => deriveRecipientEmailHint(lead), [lead]);
  const decisionMakerRaw = useMemo(() => String(lead.decision_maker || "").trim(), [lead]);
  const emailReady = Boolean(emailSubject.trim()) && Boolean(emailBody.trim());
  const canSearchLinkedin =
    !linkedinUrl && decisionMakerRaw !== "Founder/CEO (name unknown)";
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

  function handleSearchLinkedin(): void {
    const company = String(lead.company || "").trim();
    const keywords = `${decisionMakerRaw || decisionMaker.name} ${company}`.trim();
    if (!keywords) {
      return;
    }

    const query = encodeURIComponent(keywords);
    window.open(
      `https://linkedin.com/search/results/people/?keywords=${query}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <article
      className={`lead-card-enter relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ${
        isPipelineStageActive ? "lead-card-active-stage" : ""
      }`}
      style={{ animationDelay: `${cardDelayMs}ms` }}
    >
      <header className="flex items-start pr-[7.75rem] sm:pr-0">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-[#9ca3af]">
            {companyDisplay.label}
          </p>
          <h3
            className={`mt-1 break-words text-base sm:text-lg ${
              companyDisplay.isSourceLike
                ? "font-medium italic text-[#6b7280]"
                : "font-semibold text-[#111827]"
            }`}
            title={String(lead.company || "")}
          >
            {companyDisplay.displayName}
          </h3>
          <p className="mt-1 text-sm text-[#6b7280]">Size: {companySize}</p>
        </div>
        <div
          className={`absolute right-3 top-3 flex items-center gap-2 rounded-full border px-2 py-1 sm:static sm:ml-auto sm:gap-3 sm:px-3 ${scoreTone}`}
        >
          <div className="relative h-10 w-10 sm:h-12 sm:w-12">
            <svg className="h-10 w-10 -rotate-90 sm:h-12 sm:w-12" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r={scoreRingRadius} fill="none" stroke="#d1d5db" strokeWidth="4" />
              <circle
                cx="24"
                cy="24"
                r={scoreRingRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                style={{
                  strokeDasharray: scoreRingCircumference,
                  strokeDashoffset: scoreStrokeOffset,
                  transition: "stroke-dashoffset 80ms linear",
                }}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-xs font-bold text-current sm:text-sm">
              {animatedScore}
            </span>
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em]">Score</p>
            <p className="text-xs text-[#6b7280]">Relevance Score</p>
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Decision Maker</p>
          <p className="mt-2 text-sm font-semibold text-[#374151]">{decisionMaker.name}</p>
          {decisionMaker.title ? (
            <p className="mt-1 text-sm text-[#6b7280]">{decisionMaker.title}</p>
          ) : null}

          {linkedinUrl ? (
            <div className="mt-4">
              <article className="relative rounded-xl border border-[#0077B5] bg-white p-3">
                <span className="absolute left-3 top-3 inline-grid h-4 w-4 place-items-center rounded-sm bg-[#0077B5] text-[0.6rem] font-bold leading-none text-white">
                  in
                </span>

                <div className="flex items-start justify-between gap-3 pl-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#111827]">{decisionMaker.name}</p>
                    {decisionMaker.title ? (
                      <p className="mt-0.5 truncate text-xs text-[#6b7280]">{decisionMaker.title}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-[#6b7280]">{String(lead.company || "Unknown Company")}</p>
                  </div>

                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-[#0077B5] transition-colors hover:text-[#005f91]"
                  >
                    View Profile →
                  </a>
                </div>
              </article>

              <p className="mt-2 inline-flex rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#166534]">
                ✓ Connect Message Ready
              </p>
            </div>
          ) : canSearchLinkedin ? (
            <button
              type="button"
              onClick={handleSearchLinkedin}
              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[#0077B5] px-3 py-1.5 text-xs font-semibold text-[#0077B5] transition-colors hover:bg-[#eff6ff] hover:text-[#005f91]"
            >
              🔍 Search on LinkedIn
            </button>
          ) : (
            <p className="mt-4 text-xs text-[#9ca3af]">LinkedIn profile not found</p>
          )}
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Pain Point Detected</p>
          <p className="mt-2 truncate text-sm text-[#6b7280]">{painPoint}</p>
          <p className="mt-2 text-xs text-[#6b7280]">Source: {source}</p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Email Draft</p>
            <button
              type="button"
              onClick={() => setEmailExpanded((current) => !current)}
              className="inline-flex min-h-11 items-center text-xs font-medium text-accent hover:text-[#0052cc]"
            >
              {emailExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {emailExpanded ? (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.15em] text-[#9ca3af]">Subject</span>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition-colors focus:border-accent"
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.15em] text-[#9ca3af]">Body</span>
                <textarea
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                  rows={9}
                  className="mt-2 w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm leading-relaxed text-[#111827] outline-none transition-colors focus:border-accent"
                />
              </label>
            </div>
          ) : (
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-[#6b7280]">
              {emailBody || "No email draft generated."}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">LinkedIn Message</p>
            <button
              type="button"
              onClick={() => setLinkedinExpanded((current) => !current)}
              className="inline-flex min-h-11 items-center text-xs font-medium text-accent hover:text-[#0052cc]"
            >
              {linkedinExpanded ? "Collapse" : "Expand"}
            </button>
          </div>

          {linkedinExpanded ? (
            <textarea
              value={linkedinMessage}
              onChange={(event) => setLinkedinMessage(event.target.value)}
              rows={9}
              className="mt-3 w-full resize-y rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm leading-relaxed text-[#111827] outline-none transition-colors focus:border-accent"
            />
          ) : (
            <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-[#6b7280]">
              {linkedinMessage || "No LinkedIn draft generated."}
            </p>
          )}
        </section>
      </div>

      <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
        <button
          type="button"
          onClick={() => setShowFollowups((current) => !current)}
          className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-[0.16em] text-accent hover:text-[#0052cc]"
        >
          {showFollowups ? "Hide Follow-up Timeline" : "Show Follow-up Timeline"}
        </button>

        {showFollowups ? (
          <div className="mt-3">
            <FollowupTimeline sequence={lead.followup_sequence ?? []} />
          </div>
        ) : null}
      </div>

      <footer className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1">
            <span className="text-xs uppercase tracking-[0.18em] text-[#9ca3af]">Recipient Email</span>
            <input
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={leadEmailHint ? undefined : "Enter decision maker's email"}
              className="mt-2 h-11 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition-colors focus:border-accent"
            />
          </label>

          <div className="flex w-full flex-col gap-2 md:w-auto">
            <button
              type="button"
              onClick={handleSend}
              disabled={sendState === "sending" || sendState === "sent" || !emailReady}
              className="h-11 w-full rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-white transition hover:bg-[#0052cc] disabled:cursor-not-allowed disabled:opacity-55 md:w-auto"
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
              className="h-11 w-full rounded-lg border border-[#e5e7eb] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] md:w-auto"
            >
              Copy LinkedIn Message
            </button>
          </div>
        </div>

        {sendMessage ? (
          <p className={`mt-3 text-sm ${sendState === "error" ? "text-[#dc2626]" : "text-[#16a34a]"}`}>
            {sendMessage}
          </p>
        ) : null}

        {trackingState === "polling" ? (
          <p className="mt-3 text-sm text-[#1d4ed8]">
            {"\uD83D\uDCE8 Email delivered \u2014 waiting for open..."}
          </p>
        ) : null}

        {trackingState === "opened" ? (
          <div
            className={`mt-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-[#166534] ${
              openedBannerFlash ? "animate-pulse" : ""
            }`}
          >
            <p className="text-sm font-semibold">{"\uD83C\uDF89 Email opened!"}</p>
            <p className="mt-1 text-xs text-[#166534]">{openedRelativeTime || "Opened just now"}</p>
          </div>
        ) : null}

        {copyMessage ? (
          <p className={`mt-2 text-sm ${copyState === "error" ? "text-[#dc2626]" : "text-[#1d4ed8]"}`}>
            {copyMessage}
          </p>
        ) : null}

        {!emailReady ? (
          <p className="mt-3 text-xs text-[#d97706]">
            Draft missing subject/body. This lead cannot be sent yet.
          </p>
        ) : null}
      </footer>

      <style jsx>{`
        .lead-card-enter {
          animation: leadCardEnter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }

        .lead-card-active-stage {
          box-shadow:
            0 0 0 1px rgba(82, 165, 255, 0.45),
            0 0 28px rgba(82, 165, 255, 0.35),
            0 0 56px rgba(82, 165, 255, 0.22);
        }

        .lead-card-active-stage::before {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          top: -35%;
          height: 35%;
          background: linear-gradient(
            180deg,
            rgba(79, 151, 255, 0) 0%,
            rgba(79, 151, 255, 0.16) 45%,
            rgba(148, 199, 255, 0.24) 50%,
            rgba(79, 151, 255, 0) 100%
          );
          mix-blend-mode: screen;
          pointer-events: none;
          animation: stageScanline 2.8s linear infinite;
        }

        .lead-card-active-stage::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          box-shadow:
            0 0 0 1px rgba(109, 182, 255, 0.55),
            0 0 32px rgba(109, 182, 255, 0.42),
            0 0 68px rgba(109, 182, 255, 0.28);
          opacity: 0.35;
          animation: activeStagePulse 1.8s ease-in-out infinite;
        }

        @keyframes leadCardEnter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes stageScanline {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(400%);
          }
        }

        @keyframes activeStagePulse {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.75;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .lead-card-enter,
          .lead-card-active-stage::before,
          .lead-card-active-stage::after {
            animation: none;
          }
        }
      `}</style>
    </article>
  );
}


