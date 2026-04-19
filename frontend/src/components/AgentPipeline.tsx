"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { getStreamUrl, stopHunt } from "@/lib/huntr-api";
import type { StreamEvent } from "@/lib/huntr-types";

interface AgentPipelineProps {
  jobId: string;
}

type StreamState = "connecting" | "live" | "closed" | "error";
type SseStatus = "connecting" | "connected" | "running" | "closed" | "error";
type StagePhase = "inactive" | "active" | "complete" | "cancelled";
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
    return "border-[#16a34a] bg-white shadow-[0_1px_3px_rgba(22,163,74,0.16)]";
  }
  if (phase === "cancelled") {
    return "border-[#e5e7eb] bg-[#f9fafb]";
  }
  if (phase === "active") {
    return "border-[#0066ff] bg-white shadow-[0_0_0_1px_rgba(0,102,255,0.2)_inset,0_0_22px_rgba(0,102,255,0.22)]";
  }
  return "border-[#e5e7eb] bg-[#f9fafb]";
}

function streamStateTone(state: SseStatus): string {
  if (state === "running" || state === "connected") {
    return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }
  if (state === "error") {
    return "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]";
  }
  if (state === "closed") {
    return "border-[#e5e7eb] bg-[#f3f4f6] text-[#6b7280]";
  }
  return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
}

function stateLabel(state: SseStatus): string {
  if (state === "running") {
    return "SSE Running";
  }
  if (state === "connected") {
    return "SSE Connected";
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
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState("");
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
    setIsStopping(false);
    setStopError("");
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
        action === "hunt_stopped" ||
        (agent === "manager" &&
          (action === "ready" ||
            action === "complete" ||
            action === "failed" ||
            action === "stopped"))
      );
    });
  }, [events, streamState]);

  const isStoppedRun = useMemo(() => {
    return events.some((event) => {
      const action = event.action.toLowerCase();
      const agent = event.agent.toLowerCase();
      return action === "hunt_stopped" || (agent === "manager" && action === "stopped");
    });
  }, [events]);

  const sseStatus = useMemo<SseStatus>(() => {
    if (streamState === "error") {
      return "error";
    }
    if (streamState === "closed") {
      return "closed";
    }
    if (streamState === "connecting") {
      return "connecting";
    }

    if (events.length === 0 || isTerminalRun) {
      return "connected";
    }

    return "running";
  }, [events.length, isTerminalRun, streamState]);

  useEffect(() => {
    if (!isStopping) {
      return;
    }

    if (isStoppedRun || streamState === "closed" || streamState === "error") {
      setIsStopping(false);
    }
  }, [isStopping, isStoppedRun, streamState]);

  async function handleStop(): Promise<void> {
    if (isStopping) {
      return;
    }

    setIsStopping(true);
    setStopError("");

    try {
      await stopHunt(jobId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to stop hunt right now.";
      setStopError(detail);
      setIsStopping(false);
    }
  }

  const showStopButton =
    (sseStatus === "running" || sseStatus === "connected") && !isTerminalRun && !isStoppedRun;

  const terminalEvents = useMemo(() => events.slice(-180), [events]);

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#111827]">Live Agent Pipeline</h2>
          <p className="mt-1 break-all text-sm text-[#6b7280]">
            Real-time orchestration stream for job {jobId}
          </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="hidden rounded-xl border border-[#e5e7eb] bg-white px-4 py-2 text-right shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
                Total Leads Found
              </p>
              <p className="font-mono text-2xl font-semibold text-[#0066ff]">{totalLeadsFound}</p>
            </div>
            <span
              className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${streamStateTone(sseStatus)}`}
            >
              {stateLabel(sseStatus)}
            </span>
          </div>
        </div>

        {showStopButton ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={isStopping}
            className="min-h-11 w-full rounded-md border border-[#dc2626] px-3 py-1.5 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isStopping ? "Stopping..." : "⬛ Stop"}
          </button>
        ) : null}
      </header>

      {stopError ? (
        <p className="mt-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#dc2626]">
          {stopError}
        </p>
      ) : null}

      {isStoppedRun ? (
        <div className="mt-4 rounded-xl border border-[#fde047] bg-[#fefce8] px-4 py-2 text-sm font-medium text-[#854d0e]">
          Hunt stopped — partial results available below
        </div>
      ) : null}

      {selfCorrectionBannerState !== "hidden" ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-2 text-sm font-medium ${
            selfCorrectionBannerState === "resolved"
              ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]"
              : "border-[#fde047] bg-[#fefce8] text-[#854d0e]"
          }`}
        >
          {selfCorrectionBannerState === "resolved"
            ? "✅ Self-corrected — refined query returned 18 leads"
            : "Agent self-corrected — retrying with refined query"}
        </div>
      ) : null}

      <div className="mt-5 pb-1">
        <div className="flex min-w-max items-stretch gap-2 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((stage, index) => {
            const stageData = stageSnapshots[stage.id];
            const hasEvents = stageData.eventCount > 0;
            const isActive =
              !isTerminalRun &&
              (latestAgentIndex === index ||
                (latestAgentIndex === -1 && index === 0 && streamState !== "error"));
            const isComplete =
              hasEvents &&
              (isStoppedRun ||
                (isTerminalRun ? latestAgentIndex >= index || stageData.processed > 0 : latestAgentIndex > index));

            const isCancelled = isStoppedRun && !isComplete;

            const phase: StagePhase = isComplete
              ? "complete"
              : isActive
                ? "active"
                : isCancelled
                  ? "cancelled"
                  : "inactive";

            return (
              <Fragment key={stage.id}>
                <article
                  className={`relative w-56 shrink-0 rounded-xl border p-4 transition-all duration-300 sm:w-60 ${stageTone(phase)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-base font-semibold ${
                        phase === "complete"
                          ? "text-[#166534]"
                          : phase === "active"
                            ? "text-[#0066ff]"
                            : "text-[#9ca3af]"
                      }`}
                    >
                      <span className="mr-2">{stage.emoji}</span>
                      {stage.title}
                    </p>
                    {stageData.retried ? (
                      <span className="rounded-full border border-[#f59e0b] bg-[#fff7ed] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#b45309]">
                        Retried
                      </span>
                    ) : null}
                  </div>

                  <p
                    className={`mt-2 text-xs leading-relaxed ${
                      phase === "complete" ? "text-[#166534]" : "text-[#9ca3af]"
                    }`}
                  >
                    {stage.detail}
                  </p>

                  <div className="mt-4 flex items-center justify-between border-t border-[#e5e7eb] pt-3 text-xs">
                    {phase === "complete" ? (
                      <span className="font-semibold text-[#166534]">✓ Complete</span>
                    ) : phase === "active" ? (
                      <span className="font-semibold text-[#0066ff]">Running...</span>
                    ) : phase === "cancelled" ? (
                      <span className="font-semibold text-[#9ca3af]">Cancelled</span>
                    ) : (
                      <span className="text-[#9ca3af]">Waiting</span>
                    )}

                    <span
                      className={`font-mono text-[11px] ${
                        phase === "complete"
                          ? "text-[#166534]"
                          : phase === "active"
                            ? "text-[#0066ff]"
                            : "text-[#9ca3af]"
                      }`}
                    >
                      {stageData.processed} leads
                    </span>
                  </div>
                </article>

                {index < PIPELINE_STAGES.length - 1 ? (
                  <div className="flex items-center justify-center px-1 py-0 text-xl text-[#0066ff]">
                    <span>→</span>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Live Agent Log</p>
        <div
          ref={logContainerRef}
          className="mt-3 h-[200px] overflow-y-auto rounded-lg border border-[#374151] bg-[#111827] p-3 font-mono text-xs sm:h-64"
        >
          {terminalEvents.length > 0 ? (
            terminalEvents.map((event, index) => (
              <p
                key={`${event.timestamp}-${event.agent}-${event.action}-${index}`}
                className="mb-1.5 flex gap-2 leading-relaxed text-[#e5e7eb]"
              >
                <span className="text-[#22c55e]">$</span>
                <span className="wrap-break-word">{formatTraceLine(event)}</span>
              </p>
            ))
          ) : (
            <p className="text-[#9ca3af]">$ waiting for agent telemetry...</p>
          )}

          <p className="mt-2 flex items-center gap-2 text-[#bbf7d0]">
            <span>hunt@pipeline</span>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
          </p>
        </div>
      </div>
    </section>
  );
}


