"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const AGENT_CARDS = [
  {
    id: "01",
    name: "Scout",
    description:
      "Finds 20+ leads showing real pain signals across LinkedIn, Reddit and IndiaMART",
    icon: "◉",
  },
  {
    id: "02",
    name: "Researcher",
    description:
      "Enriches each lead with company data, decision maker name and email",
    icon: "◎",
  },
  {
    id: "03",
    name: "Scorer",
    description:
      "Ranks leads 1-100 based on fit, urgency and budget signals",
    icon: "◌",
  },
  {
    id: "04",
    name: "Outreach",
    description:
      "Writes a hyper-personalized email and LinkedIn message for each lead",
    icon: "✉",
  },
  {
    id: "05",
    name: "Followup",
    description:
      "Builds a Day 3, 7, 14 follow-up sequence automatically",
    icon: "↺",
  },
];

const IMPACT_TARGETS = [2, 5, 0, 3];

const TECH_STACK = [
  "Google ADK",
  "Gemini 2.5 Flash",
  "Vertex AI",
  "FastAPI",
  "Cloud Run",
  "Firestore",
  "Next.js",
  "Vercel",
];

function renderImpactValue(index: number, value: number): string {
  if (index === 0) {
    return `${value} min`;
  }
  if (index === 1) {
    return `${value} agents`;
  }
  if (index === 2) {
    return `₹${value}`;
  }
  return `${value}+ hrs`;
}

export default function LandingPage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLElement | null>(null);
  const impactRef = useRef<HTMLElement | null>(null);

  const [navbarBlurred, setNavbarBlurred] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [impactVisible, setImpactVisible] = useState(false);
  const [impactValues, setImpactValues] = useState([0, 0, 0, 0]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHeroReady(true);
    }, 40);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onScroll = (): void => {
      const heroHeight = heroRef.current?.offsetHeight ?? window.innerHeight;
      setNavbarBlurred(window.scrollY > heroHeight - 120);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!cardsRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCardsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(cardsRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!impactRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setImpactVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(impactRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!impactVisible) {
      return;
    }

    const durationMs = 1200;
    const startMs = performance.now();
    let frameId = 0;

    const tick = (now: number): void => {
      const progress = Math.min((now - startMs) / durationMs, 1);
      setImpactValues(IMPACT_TARGETS.map((target) => Math.round(target * progress)));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [impactVisible]);

  const scrollToHowItWorks = (): void => {
    const section = document.getElementById("how-it-works");
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <main className="bg-white text-black">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          navbarBlurred ? "bg-white/85 backdrop-blur-md" : "bg-white"
        }`}
        style={{ boxShadow: "0 1px 0 #e5e7eb" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-xl font-semibold lowercase tracking-tight text-black">
            huntr
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-black"
            >
              Sign in
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Start for free →
            </Link>
          </div>
        </div>
      </header>

      <section ref={heroRef} className="flex min-h-screen items-center bg-white pb-14 pt-28 sm:pb-16">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="mx-auto inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">
            Powered by Google ADK + Gemini 2.5
          </p>

          <h1
            className={`mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-tight text-black transition-all duration-700 md:text-6xl ${
              heroReady ? "translate-y-0 opacity-100" : "translate-y-2.5 opacity-0"
            }`}
          >
            Your AI sales team.
            <br />
            Without the payroll.
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-gray-600 md:text-lg">
            HuntR deploys 5 autonomous agents that find, research, score, and personally message
            your next B2B client — in under 2 minutes.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex w-full items-center justify-center rounded-full bg-black px-8 py-3 text-base font-semibold text-white transition hover:bg-gray-800 sm:w-auto"
            >
              Start hunting free →
            </Link>
            <button
              type="button"
              onClick={scrollToHowItWorks}
              className="inline-flex w-full items-center justify-center rounded-full border border-gray-300 bg-white px-8 py-3 text-base font-semibold text-gray-700 transition hover:border-gray-400 hover:text-black sm:w-auto"
            >
              See how it works
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500 sm:text-sm">
            57 leads found today · 89 emails personalized · Powered by 5 AI agents
          </p>

          <div className="mx-auto mt-10 max-w-5xl">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3">
              <div className="relative overflow-hidden rounded-xl bg-[#0a0a0a] shadow-2xl">
                <div className="flex h-52 items-center justify-center text-2xl font-medium text-white/90 sm:h-64 md:h-80">
                  Live Demo
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/80 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" ref={cardsRef} className="bg-white py-20 sm:py-24">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-black md:text-5xl">
            Five agents. One goal.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-base text-gray-600 md:text-lg">
            Each agent is specialized. Together, they replace your entire outbound sales process.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {AGENT_CARDS.map((card, index) => (
              <article
                key={card.id}
                className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-lg ${
                  cardsVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <span className="pointer-events-none absolute right-3 top-2 text-7xl font-semibold leading-none text-gray-100">
                  {card.id}
                </span>

                <div className="relative z-10">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-gray-700">
                    {card.icon}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-black">{card.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{card.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section ref={impactRef} className="py-20 sm:py-24" style={{ backgroundColor: "#f9fafb" }}>
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-10 lg:grid-cols-4">
            {[
              "From zero to personalized outreach",
              "Working in parallel, autonomously",
              "Cost per lead vs ₹840+ manual",
              "Saved per prospecting session",
            ].map((label, index) => (
              <div key={label} className="text-center">
                <p className="text-4xl font-bold tracking-tight text-black md:text-5xl">
                  {renderImpactValue(index, impactValues[index] ?? 0)}
                </p>
                <p className="mx-auto mt-3 max-w-[18ch] text-sm leading-relaxed text-gray-600 md:text-base">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <p className="inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">
              Built-in resilience
            </p>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-black md:text-5xl">
              When agents fail, they don&apos;t stop. They retry.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 md:text-lg">
              If ScoutAgent returns fewer than 5 leads, the Manager Agent automatically retries
              with 3 refined query variations. Every failure is a learning opportunity.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-gray-700 md:text-base">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <span>Automatic query refinement on low results</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <span>Threshold adjustment when scoring fails</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 text-emerald-600">✓</span>
                <span>Partial results preserved if hunt is stopped</span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl bg-[#0a0a0a] p-5 shadow-2xl">
            <div className="space-y-3">
              <div className="rounded-lg border border-yellow-300/40 bg-yellow-400/15 px-4 py-3 text-sm text-yellow-100">
                ⚠ Insufficient leads (2). Retrying...
              </div>
              <div className="rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100">
                ✅ Refined query returned 18 leads.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-black md:text-5xl">
            Built on the best.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 md:text-lg">
            Enterprise-grade infrastructure. Zero compromise.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {TECH_STACK.map((tech) => (
              <span
                key={tech}
                className="inline-flex rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black py-20 sm:py-24">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Stop prospecting. Start closing.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-300 md:text-lg">
            Every Indian startup deserves a sales team. HuntR is yours.
          </p>

          <Link
            href="/app"
            className="mt-8 inline-flex items-center rounded-full bg-white px-8 py-3 text-base font-semibold text-black transition hover:bg-gray-100"
          >
            Launch HuntR free →
          </Link>

          <p className="mt-5 text-sm text-gray-400">No credit card. No setup. Just leads.</p>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-lg font-semibold lowercase text-black">huntr</p>
            <p className="mt-1 text-sm text-gray-500">© 2026 HuntR. Built for Agentathon 2026.</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <a
              href="https://github.com/mohanprasath-dev/huntr"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-black"
            >
              GitHub
            </a>
            <a
              href="https://huntr-backend-1095027648976.us-central1.run.app/docs"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-black"
            >
              Backend API
            </a>
            <a
              href="https://github.com/mohanprasath-dev/huntr#readme"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-black"
            >
              Documentation
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
