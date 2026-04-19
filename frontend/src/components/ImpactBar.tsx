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
    <section className="w-full rounded-2xl border border-[#e5e7eb] border-l-4 border-l-[#0066ff] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:p-4 md:p-5">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
          <p className="text-lg font-bold tracking-tight text-[#111827] sm:text-2xl">
            ⏱ {formatTimeSaved(timeSavedMinutes)}
          </p>
          <p className="mt-1 text-xs text-[#6b7280] sm:text-sm">saved</p>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
          <p className="text-lg font-bold tracking-tight text-[#111827] sm:text-2xl">🎯 {leadsFound}</p>
          <p className="mt-1 text-xs text-[#6b7280] sm:text-sm">leads found</p>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
          <p className="text-lg font-bold tracking-tight text-[#111827] sm:text-2xl">✉️ {emailsPersonalized}</p>
          <p className="mt-1 text-xs text-[#6b7280] sm:text-sm">emails personalized</p>
        </div>

        <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
          <p className="text-lg font-bold tracking-tight text-[#111827] sm:text-2xl">💰 ₹{formatInr(manualCostInr)}</p>
          <p className="mt-1 text-xs text-[#6b7280] sm:text-sm">manual cost replaced</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-[#6b7280]">
        Pipeline completed in {impact.pipeline_duration_seconds} seconds · Powered by 5 AI agents
      </p>
    </section>
  );
}