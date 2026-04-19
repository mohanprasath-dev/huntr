"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  showMic?: boolean;
  isListening?: boolean;
  onMicClick?: () => void;
}

function InputField({
  id,
  label,
  value,
  onChange,
  placeholder,
  showMic = false,
  isListening = false,
  onMicClick,
}: InputFieldProps) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      <div className="relative mt-2">
        <input
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={isListening ? "Listening..." : placeholder}
          className={`w-full rounded-lg border border-white/15 bg-panel-elevated px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-accent ${
            showMic ? "pr-11" : ""
          } ${isListening ? "placeholder:italic placeholder:text-slate-400" : ""}`}
        />
        {showMic && onMicClick ? (
          <button
            type="button"
            onClick={onMicClick}
            title="Click to speak"
            aria-label="Click to speak"
            className={`absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md border p-1.5 transition-colors ${
              isListening
                ? "animate-pulse border-rose-300/80 bg-rose-500/20 text-rose-100"
                : "border-white/20 bg-white/5 text-slate-200 hover:border-accent/80 hover:text-white"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
              <path d="M6.25 11a.75.75 0 0 1 .75.75V12a5 5 0 1 0 10 0v-.25a.75.75 0 0 1 1.5 0V12a6.5 6.5 0 0 1-5.75 6.45V21h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-2.55A6.5 6.5 0 0 1 5.5 12v-.25a.75.75 0 0 1 .75-.75Z" />
            </svg>
          </button>
        ) : null}
      </div>
    </label>
  );
}

type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

export default function CampaignForm() {
  const router = useRouter();
  const [form, setForm] = useState<HuntRequestPayload>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [listeningField, setListeningField] = useState<keyof HuntRequestPayload | null>(null);
  const [canUseSpeech, setCanUseSpeech] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isBusy = isSubmitting || isDemoSubmitting;

  const canSubmit = useMemo(
    () => Object.values(form).every((value) => value.trim().length >= 2),
    [form],
  );

  function updateField(field: keyof HuntRequestPayload, value: string): void {
    setForm((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    setCanUseSpeech(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    );

    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function handleSpeechInput(field: "niche" | "pain_keyword"): void {
    if (
      typeof window === "undefined" ||
      !("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    ) {
      return;
    }

    if (listeningField === field) {
      recognitionRef.current?.stop();
      setListeningField(null);
      return;
    }

    recognitionRef.current?.stop();

    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        updateField(field, transcript);
      }
    };

    recognition.onerror = () => {
      setListeningField(null);
    };

    recognition.onend = () => {
      setListeningField((current) => (current === field ? null : current));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListeningField(field);

    try {
      recognition.start();
    } catch {
      setListeningField(null);
      recognitionRef.current = null;
    }
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
      router.push(`/app/hunt/${response.job_id}`);
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
      router.push(`/app/hunt/${response.job_id}`);
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
          value={listeningField === "niche" ? "" : form.niche}
          onChange={(value) => updateField("niche", value)}
          placeholder="AI services"
          showMic={canUseSpeech}
          isListening={listeningField === "niche"}
          onMicClick={() => handleSpeechInput("niche")}
        />
        <InputField
          id="pain_keyword"
          label="Pain Keyword"
          value={listeningField === "pain_keyword" ? "" : form.pain_keyword}
          onChange={(value) => updateField("pain_keyword", value)}
          placeholder="manual outbound bottlenecks"
          showMic={canUseSpeech}
          isListening={listeningField === "pain_keyword"}
          onMicClick={() => handleSpeechInput("pain_keyword")}
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


