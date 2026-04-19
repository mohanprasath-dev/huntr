"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { startDemoSelfCorrect, startHunt } from "@/lib/huntr-api";
import type { DemoSelfCorrectRequestPayload, HuntRequestPayload } from "@/lib/huntr-types";

const INITIAL_FORM: HuntRequestPayload = {
  niche: "AI Services",
  pain_keyword: "manual outbound bottlenecks",
  sender_name: "Mohan Prasath",
  sender_company: "HuntR",
  sender_service: "AI outbound automation",
};

const DEMO_SELF_CORRECT_PAYLOAD: DemoSelfCorrectRequestPayload = {
  sender_name: "Mohan Prasath",
  sender_company: "Taskdrift",
  sender_service: "AI automation for Indian startups",
};

interface InputFieldProps {
  id: keyof HuntRequestPayload;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function InputField({ id, label, value, onChange, placeholder }: InputFieldProps) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-white/15 bg-panel-elevated px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent"
      />
    </label>
  );
}

export default function CampaignForm() {
  const router = useRouter();
  const [form, setForm] = useState<HuntRequestPayload>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isBusy = isSubmitting || isDemoSubmitting;

  const canSubmit = useMemo(
    () => Object.values(form).every((value) => value.trim().length >= 2),
    [form],
  );

  function updateField(field: keyof HuntRequestPayload, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || isBusy) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload: HuntRequestPayload = {
        niche: form.niche.trim(),
        pain_keyword: form.pain_keyword.trim(),
        sender_name: form.sender_name.trim(),
        sender_company: form.sender_company.trim(),
        sender_service: form.sender_service.trim(),
      };

      const response = await startHunt(payload);
      router.push(`/hunt/${response.job_id}`);
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "Failed to start campaign.";
      setError(detail);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRunLiveDemo(): Promise<void> {
    if (isBusy) {
      return;
    }

    setIsDemoSubmitting(true);
    setError("");

    try {
      const response = await startDemoSelfCorrect(DEMO_SELF_CORRECT_PAYLOAD);
      router.push(`/hunt/${response.job_id}`);
    } catch (submitError) {
      const detail = submitError instanceof Error ? submitError.message : "Failed to run live demo.";
      setError(detail);
    } finally {
      setIsDemoSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/10 bg-panel p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Campaign Setup</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Launch a New Hunt</h2>
        </div>
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-blue-100">
          Production Mode
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <InputField
          id="niche"
          label="Niche"
          value={form.niche}
          onChange={(value) => updateField("niche", value)}
          placeholder="AI services"
        />
        <InputField
          id="pain_keyword"
          label="Pain Keyword"
          value={form.pain_keyword}
          onChange={(value) => updateField("pain_keyword", value)}
          placeholder="manual outbound bottlenecks"
        />
        <InputField
          id="sender_name"
          label="Sender Name"
          value={form.sender_name}
          onChange={(value) => updateField("sender_name", value)}
          placeholder="Mohan Prasath"
        />
        <InputField
          id="sender_company"
          label="Sender Company"
          value={form.sender_company}
          onChange={(value) => updateField("sender_company", value)}
          placeholder="HuntR"
        />
      </div>

      <div className="mt-4">
        <InputField
          id="sender_service"
          label="Sender Service"
          value={form.sender_service}
          onChange={(value) => updateField("sender_service", value)}
          placeholder="AI outbound automation"
        />
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          HuntR will activate 5 autonomous agents and generate fully drafted outreach.
        </p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <button
            type="submit"
            disabled={!canSubmit || isBusy}
            className="w-full rounded-lg border border-accent/60 bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.1)_inset,0_12px_24px_rgba(0,102,255,0.25)] transition hover:bg-[#2f7dff] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {isSubmitting ? "Launching..." : "Start Hunting"}
          </button>
          <button
            type="button"
            onClick={handleRunLiveDemo}
            disabled={isBusy}
            className="w-full rounded-lg border border-[#2db5ff] bg-transparent px-4 py-2 text-xs font-semibold tracking-[0.08em] text-white transition hover:border-[#78d2ff] hover:bg-[#0a1f3c] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          >
            {isDemoSubmitting ? "Starting Demo..." : "▶ Run Live Demo"}
          </button>
        </div>
      </div>
    </form>
  );
}


