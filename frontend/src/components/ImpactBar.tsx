"use client";

import { useEffect, useRef, useState } from "react";

import type { JobImpact } from "@/lib/huntr-types";

interface ImpactBarProps {
  impact: JobImpact;
}

const COUNTER_DURATION_MS = 1500;

function useAnimatedCounter(target: number, enabled: boolean): number {
  const [value, setValue] = useState(0);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const safeTarget = Math.max(0, Math.round(target));

    if (hasAnimatedRef.current) {
      setValue(safeTarget);
      return;
    }

    hasAnimatedRef.current = true;
    const startTime = performance.now();
    let frameId = 0;

    const animate = (now: number): void => {
      const progress = Math.min((now - startTime) / COUNTER_DURATION_MS, 1);
      setValue(Math.round(safeTarget * progress));

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [enabled, target]);

  return value;
}

function formatTimeSaved(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}h ${minutes}min`;
}

function formatInr(value: number): string {
  const safeValue = Math.max(0, Math.round(value));
  return new Intl.NumberFormat("en-IN").format(safeValue);
}

export default function ImpactBar({ impact }: ImpactBarProps) {
  const timeSavedMinutes = useAnimatedCounter(impact.time_saved_minutes, true);
  const leadsFound = useAnimatedCounter(impact.leads_found, true);
  const emailsPersonalized = useAnimatedCounter(impact.emails_personalized, true);
  const manualCostInr = useAnimatedCounter(impact.manual_cost_inr, true);

  return (
    <section className="w-full rounded-2xl border border-white/10 border-l-4 border-l-blue-400 bg-slate-950/75 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.45)] md:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-bold tracking-tight text-white">
            ⏱ {formatTimeSaved(timeSavedMinutes)}
          </p>
          <p className="mt-1 text-sm text-slate-300">saved</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-bold tracking-tight text-white">🎯 {leadsFound}</p>
          <p className="mt-1 text-sm text-slate-300">leads found</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-bold tracking-tight text-white">✉️ {emailsPersonalized}</p>
          <p className="mt-1 text-sm text-slate-300">emails personalized</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-2xl font-bold tracking-tight text-white">💰 ₹{formatInr(manualCostInr)}</p>
          <p className="mt-1 text-sm text-slate-300">manual cost replaced</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-blue-100/90">
        Pipeline completed in {impact.pipeline_duration_seconds} seconds · Powered by 5 AI agents
      </p>
    </section>
  );
}