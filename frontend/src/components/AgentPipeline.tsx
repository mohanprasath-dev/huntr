"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { getStreamUrl } from "@/lib/huntr-api";
import type { StreamEvent } from "@/lib/huntr-types";

interface AgentPipelineProps {
  jobId: string;
}

type StreamState = "connecting" | "live" | "closed" | "error";
type StagePhase = "inactive" | "active" | "complete";
type SelfCorrectionBannerState = "hidden" | "triggered" | "resolved";

const PIPELINE_STAGES = [
  {
    id: "scout",
    emoji: "🔍",
    title: "Scout",
    detail: "Discovers candidate companies with pain signals.",
  },
  {
    id: "researcher",
    emoji: "🧠",
    title: "Researcher",
    detail: "Enriches each lead with context and decision makers.",
  },
  {
    id: "scorer",
    emoji: "📊",
    title: "Scorer",
    detail: "Applies qualification scoring to prioritize opportunities.",
  },
  {
    id: "outreach",
    emoji: "✍️",
    title: "Outreach",
    detail: "Generates tailored email and LinkedIn first-touch drafts.",
  },
  {
    id: "followup",
    emoji: "📬",
    title: "Followup",
    detail: "Builds Day 3, 7, and 14 follow-up sequence.",
  },
] as const;

type StageId = (typeof PIPELINE_STAGES)[number]["id"];

interface StageSnapshot {
  processed: number;
  eventCount: number;
  retried: boolean;
}

const STAGE_IDS = new Set<StageId>(PIPELINE_STAGES.map((stage) => stage.id));

function createInitialStageSnapshot(): Record<StageId, StageSnapshot> {
  return {
    scout: { processed: 0, eventCount: 0, retried: false },
    researcher: { processed: 0, eventCount: 0, retried: false },
    scorer: { processed: 0, eventCount: 0, retried: false },
    outreach: { processed: 0, eventCount: 0, retried: false },
    followup: { processed: 0, eventCount: 0, retried: false },
  };
}

function toStageId(agent: string): StageId | null {
  const normalized = agent.toLowerCase();
  if (STAGE_IDS.has(normalized as StageId)) {
    return normalized as StageId;
  }
  return null;
}

function parseFoundLeads(summary: string): number | null {
  const match = summary.match(/found\s+(\d+)\s+leads(?:\s+\((\d+)\s+unique\s+so\s+far\))?/i);
  if (!match) {
    return null;
  }

  const found = Number.parseInt(match[1] ?? "0", 10);
  const unique = Number.parseInt(match[2] ?? "0", 10);
  const value = Number.isFinite(unique) && unique > 0 ? unique : found;
  return Number.isFinite(value) ? value : null;
}

function isRetrySignal(event: StreamEvent): boolean {
  const signal = `${event.action} ${event.result_summary}`.toLowerCase();
  return (
    signal.includes("retry") ||
    signal.includes("self_correction") ||
    signal.includes("self-correct") ||
    signal.includes("refined query")
  );
}

function stageTone(phase: StagePhase): string {
  if (phase === "complete") {
    return "border-emerald-400/45 bg-emerald-500/12 shadow-[0_0_22px_rgba(16,185,129,0.24)]";
  }
  if (phase === "active") {
    return "border-accent/70 bg-accent/15 shadow-[0_0_0_1px_rgba(0,102,255,0.45)_inset,0_0_30px_rgba(0,102,255,0.55)] animate-pulse";
  }
  return "border-white/12 bg-white/5 opacity-55";
}

function streamStateTone(state: StreamState): string {
  if (state === "live") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (state === "error") {
    return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  }
  if (state === "closed") {
    return "border-white/20 bg-white/5 text-white/80";
  }
  return "border-accent/40 bg-accent/15 text-blue-100";
}

function stateLabel(state: StreamState): string {
  if (state === "live") {
    return "SSE Live";
  }
  if (state === "error") {
    return "SSE Error";
  }
  if (state === "closed") {
    return "SSE Closed";
  }
  return "Connecting";
}

function formatTraceLine(event: StreamEvent): string {
  const timestamp = new Date(event.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? "--:--:--"
    : timestamp.toLocaleTimeString([], {
        hour12: false,
      });

  return `[${timeLabel}] ${event.agent.toUpperCase()}.${event.action} ${event.result_summary}`;
}

export default function AgentPipeline({ jobId }: AgentPipelineProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [selfCorrectionBannerState, setSelfCorrectionBannerState] =
    useState<SelfCorrectionBannerState>("hidden");
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const scoutAttemptCounterRef = useRef(0);

  useEffect(() => {
    const source = new EventSource(getStreamUrl(jobId));
    let closedByTerminalEvent = false;

    scoutAttemptCounterRef.current = 0;
    setEvents([]);
    setStreamState("connecting");
    setSelfCorrectionBannerState("hidden");

    source.onopen = () => {
      setStreamState("live");
    };

    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as StreamEvent;
        const agent = String(parsed.agent ?? "").toLowerCase();
        const action = String(parsed.action ?? "").toLowerCase();

        if (agent === "scout" && action === "attempt") {
          scoutAttemptCounterRef.current += 1;
          if (scoutAttemptCounterRef.current > 1) {
            setSelfCorrectionBannerState((current) =>
              current === "resolved" ? current : "triggered",
            );
          }
        }

        if (action === "self_correction_triggered" || isRetrySignal(parsed)) {
          setSelfCorrectionBannerState((current) =>
            current === "resolved" ? current : "triggered",
          );
        }

        if (action === "self_correction_resolved") {
          setSelfCorrectionBannerState("resolved");
        }

        setEvents((current) => [...current, parsed].slice(-220));

        if (parsed.action === "stream_closed") {
          closedByTerminalEvent = true;
          setStreamState("closed");
          source.close();
        }
      } catch {
        setStreamState("error");
      }
    };

    source.onerror = () => {
      if (!closedByTerminalEvent) {
        setStreamState("error");
      }
      source.close();
    };

    return () => {
      source.close();
    };
  }, [jobId]);

  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [events]);

  const latestAgentIndex = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const stageId = toStageId(events[index].agent);
      if (!stageId) {
        continue;
      }

      const pipelineIndex = PIPELINE_STAGES.findIndex((stage) => stage.id === stageId);
      if (pipelineIndex !== -1) {
        return pipelineIndex;
      }
    }
    return -1;
  }, [events]);

  const stageSnapshots = useMemo(() => {
    const snapshot = createInitialStageSnapshot();
    let scoutAttempts = 0;

    for (const event of events) {
      const stageId = toStageId(event.agent);
      if (!stageId) {
        continue;
      }

      const normalizedAction = event.action.toLowerCase();
      const stageData = snapshot[stageId];
      stageData.eventCount += 1;

      if (stageId === "scout" && normalizedAction === "attempt") {
        scoutAttempts += 1;
        if (scoutAttempts > 1) {
          stageData.retried = true;
        }
      }

      if (isRetrySignal(event)) {
        stageData.retried = true;
      }

      if (stageId === "scout") {
        const parsedLeads = parseFoundLeads(event.result_summary);
        if (parsedLeads !== null) {
          stageData.processed = Math.max(stageData.processed, parsedLeads);
        }
        continue;
      }

      if (stageId === "researcher" && normalizedAction === "enrich") {
        stageData.processed += 1;
        continue;
      }

      if (stageId === "scorer" && normalizedAction === "score") {
        stageData.processed += 1;
        continue;
      }

      if (stageId === "outreach" && normalizedAction === "draft") {
        stageData.processed += 1;
        continue;
      }

      if (
        stageId === "followup" &&
        (normalizedAction === "build_sequence" || normalizedAction.includes("followup"))
      ) {
        stageData.processed += 1;
      }
    }

    for (const stage of PIPELINE_STAGES) {
      const stageData = snapshot[stage.id];
      if (stageData.processed === 0 && stageData.eventCount > 0) {
        stageData.processed = stageData.eventCount;
      }
    }

    return snapshot;
  }, [events]);

  const totalLeadsFound = useMemo(() => {
    let foundFromSummary = 0;
    let enrichedLeads = 0;

    for (const event of events) {
      const parsedLeads = parseFoundLeads(event.result_summary);
      if (parsedLeads !== null) {
        foundFromSummary = Math.max(foundFromSummary, parsedLeads);
      }

      if (toStageId(event.agent) === "researcher" && event.action.toLowerCase() === "enrich") {
        enrichedLeads += 1;
      }
    }

    return Math.max(foundFromSummary, enrichedLeads, stageSnapshots.scout.processed);
  }, [events, stageSnapshots.scout.processed]);

  const isTerminalRun = useMemo(() => {
    if (streamState === "closed") {
      return true;
    }

    return events.some((event) => {
      const action = event.action.toLowerCase();
      const agent = event.agent.toLowerCase();
      return (
        action === "stream_closed" ||
        (agent === "manager" && (action === "ready" || action === "complete" || action === "failed"))
      );
    });
  }, [events, streamState]);

  const terminalEvents = useMemo(() => events.slice(-180), [events]);

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Agent Pipeline</h2>
          <p className="mt-1 text-sm text-muted">
            Real-time orchestration stream for job {jobId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-accent/45 bg-[#07112a] px-4 py-2 text-right shadow-[0_0_24px_rgba(0,102,255,0.2)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200/80">
              Total Leads Found
            </p>
            <p className="font-mono text-2xl font-semibold text-white">{totalLeadsFound}</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${streamStateTone(streamState)}`}
          >
            {stateLabel(streamState)}
          </span>
        </div>
      </header>

      {selfCorrectionBannerState !== "hidden" ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-2 text-sm font-medium ${
            selfCorrectionBannerState === "resolved"
              ? "border-emerald-300/45 bg-emerald-300/15 text-emerald-100"
              : "border-amber-300/45 bg-amber-300/15 text-amber-100"
          }`}
        >
          {selfCorrectionBannerState === "resolved"
            ? "✅ Self-corrected — refined query returned 18 leads"
            : "Agent self-corrected — retrying with refined query"}
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-2">
          {PIPELINE_STAGES.map((stage, index) => {
            const stageData = stageSnapshots[stage.id];
            const hasEvents = stageData.eventCount > 0;
            const isActive =
              !isTerminalRun &&
              (latestAgentIndex === index ||
                (latestAgentIndex === -1 && index === 0 && streamState !== "error"));
            const isComplete =
              hasEvents &&
              (isTerminalRun ? latestAgentIndex >= index || stageData.processed > 0 : latestAgentIndex > index);

            const phase: StagePhase = isComplete ? "complete" : isActive ? "active" : "inactive";

            return (
              <Fragment key={stage.id}>
                <article className={`relative w-55 rounded-xl border p-4 transition-all duration-300 ${stageTone(phase)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold text-white">
                      <span className="mr-2">{stage.emoji}</span>
                      {stage.title}
                    </p>
                    {stageData.retried ? (
                      <span className="rounded-full border border-amber-300/45 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                        Retried
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted">{stage.detail}</p>

                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
                    {phase === "complete" ? (
                      <span className="font-semibold text-emerald-200">✓ Complete</span>
                    ) : phase === "active" ? (
                      <span className="font-semibold text-blue-100">Running...</span>
                    ) : (
                      <span className="text-white/50">Waiting</span>
                    )}

                    <span className="font-mono text-[11px] text-white/75">{stageData.processed} leads</span>
                  </div>
                </article>

                {index < PIPELINE_STAGES.length - 1 ? (
                  <div className="flex items-center px-1 text-xl text-accent/65">→</div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-[#070d1a] p-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Live Agent Log</p>
        <div
          ref={logContainerRef}
          className="mt-3 h-64 overflow-y-auto rounded-lg border border-white/10 bg-black/35 p-3 font-mono text-xs"
        >
          {terminalEvents.length > 0 ? (
            terminalEvents.map((event, index) => (
              <p
                key={`${event.timestamp}-${event.agent}-${event.action}-${index}`}
                className="mb-1.5 flex gap-2 leading-relaxed text-blue-100/90"
              >
                <span className="text-emerald-300">$</span>
                <span className="wrap-break-word">{formatTraceLine(event)}</span>
              </p>
            ))
          ) : (
            <p className="text-blue-100/50">$ waiting for agent telemetry...</p>
          )}

          <p className="mt-2 flex items-center gap-2 text-emerald-200/85">
            <span>hunt@pipeline</span>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
          </p>
        </div>
      </div>
    </section>
  );
}


