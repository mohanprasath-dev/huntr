"use client";

import { useEffect, useMemo, useState } from "react";

import { getStreamUrl } from "@/lib/huntr-api";
import type { StreamEvent } from "@/lib/huntr-types";

interface AgentPipelineProps {
  jobId: string;
}

type StreamState = "connecting" | "live" | "closed" | "error";

const PIPELINE_AGENTS: Array<{ id: string; title: string; detail: string }> = [
  {
    id: "scout",
    title: "Scout Agent",
    detail: "Discovers candidate companies with pain signals.",
  },
  {
    id: "researcher",
    title: "Researcher Agent",
    detail: "Enriches each lead with context and decision makers.",
  },
  {
    id: "scorer",
    title: "Scorer Agent",
    detail: "Applies qualification scoring to prioritize opportunities.",
  },
  {
    id: "outreach",
    title: "Outreach Agent",
    detail: "Generates tailored email and LinkedIn first-touch drafts.",
  },
  {
    id: "followup",
    title: "Follow-up Agent",
    detail: "Builds Day 3, 7, and 14 follow-up sequence.",
  },
];

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

  useEffect(() => {
    const source = new EventSource(getStreamUrl(jobId));
    let closedByTerminalEvent = false;

    setEvents([]);
    setStreamState("connecting");

    source.onopen = () => {
      setStreamState("live");
    };

    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as StreamEvent;
        setEvents((current) => [...current, parsed].slice(-140));

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

  const latestAgentIndex = useMemo(() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const pipelineIndex = PIPELINE_AGENTS.findIndex(({ id }) => id === events[index].agent);
      if (pipelineIndex !== -1) {
        return pipelineIndex;
      }
    }
    return -1;
  }, [events]);

  const traceLines = useMemo(() => events.slice(-10).reverse().map(formatTraceLine), [events]);

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Agent Pipeline</h2>
          <p className="mt-1 text-sm text-muted">
            Real-time orchestration stream for job {jobId}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${streamStateTone(streamState)}`}
        >
          {stateLabel(streamState)}
        </span>
      </header>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        {PIPELINE_AGENTS.map((agent, index) => {
          let phase: "queued" | "active" | "completed" = "queued";
          if (latestAgentIndex > index) {
            phase = "completed";
          } else if (latestAgentIndex === index || (latestAgentIndex === -1 && index === 0)) {
            phase = "active";
          }

          const phaseClasses =
            phase === "completed"
              ? "border-emerald-400/40 bg-emerald-500/10"
              : phase === "active"
                ? "border-accent/60 bg-accent/15"
                : "border-white/10 bg-white/2";

          return (
            <article key={agent.id} className={`rounded-xl border p-3 transition-colors ${phaseClasses}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {index + 1}. {agent.title}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{agent.detail}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-[#070d1a] p-4 font-mono">
        <p className="text-xs uppercase tracking-[0.2em] text-accent">Agent Trace</p>
        <div className="mt-3 space-y-2 text-xs text-blue-100/90">
          {traceLines.length > 0 ? (
            traceLines.map((line) => (
              <p key={line} className="whitespace-pre-wrap wrap-break-word leading-relaxed">
                {line}
              </p>
            ))
          ) : (
            <p className="text-blue-100/50">Waiting for stream events...</p>
          )}
        </div>
      </div>
    </section>
  );
}


