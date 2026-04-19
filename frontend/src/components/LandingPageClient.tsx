"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

const AGENT_CARDS = [
  {
    id: "01",
    name: "Scout",
    description:
      "Finds 20+ leads showing real pain signals across LinkedIn, Reddit and IndiaMART",
    modelBadge: "Flash ⚡",
    modelTier: "flash",
  },
  {
    id: "02",
    name: "Researcher",
    description:
      "Enriches each lead with company data, decision maker name and email",
    modelBadge: "Flash ⚡",
    modelTier: "flash",
  },
  {
    id: "03",
    name: "Scorer",
    description:
      "Ranks leads 1-100 based on fit, urgency and budget signals",
    modelBadge: "Flash ⚡",
    modelTier: "flash",
  },
  {
    id: "04",
    name: "Outreach",
    description:
      "Writes a hyper-personalized email and LinkedIn message for each lead",
    modelBadge: "Pro ✦",
    modelTier: "pro",
  },
  {
    id: "05",
    name: "Followup",
    description:
      "Builds a Day 3, 7, 14 follow-up sequence automatically",
    modelBadge: "Flash ⚡",
    modelTier: "flash",
  },
] as const;

const IMPACT_TARGETS = [2, 5, 0, 3];

const TECH_STACK: Array<{
  label: string;
  tone?: "pro";
  title?: string;
}> = [
  { label: "Google ADK" },
  {
    label: "Gemini 2.5 Pro",
    tone: "pro",
    title: "Used for reasoning & outreach generation",
  },
  {
    label: "Gemini 2.5 Flash",
    title: "Used for scouting, research & scoring",
  },
  { label: "Vertex AI" },
  { label: "FastAPI" },
  { label: "Cloud Run" },
  { label: "Firestore" },
  { label: "Next.js" },
  { label: "Vercel" },
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

function AgentIcon({ id }: { id: string }) {
  if (id === "00") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === "01") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === "02") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <rect x="4" y="4" width="16" height="16" rx="2.5" />
        <path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === "03") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <path d="M5 19V9M12 19V5M19 19v-7" strokeLinecap="round" />
      </svg>
    );
  }

  if (id === "04") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M4 8l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path d="M20 12a8 8 0 1 1-2.35-5.65" strokeLinecap="round" />
      <path d="M20 5v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LandingPage() {
  const heroRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLElement | null>(null);
  const impactRef = useRef<HTMLElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const { data: session } = useSession();

  const [navbarBlurred, setNavbarBlurred] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [impactVisible, setImpactVisible] = useState(false);
  const [impactValues, setImpactValues] = useState([0, 0, 0, 0]);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const userName = session?.user?.name?.trim() || "User";
  const userImage = session?.user?.image?.trim() || "";

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

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (
        profileMenuRef.current &&
        target instanceof Node &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isProfileMenuOpen]);

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
              href="/build"
              className="text-sm font-medium text-[#374151] transition hover:text-[#111827]"
            >
              Build Story
            </Link>
            {session ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((value) => !value)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-black"
                >
                  {userImage ? (
                    <Image
                      src={userImage}
                      alt={userName}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-white"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                        <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
                        <path
                          d="M6.5 18c.6-2.5 2.8-4 5.5-4s4.9 1.5 5.5 4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  )}
                  <span className="hidden sm:inline">{userName}</span>
                </button>

                {isProfileMenuOpen ? (
                  <div className="absolute right-0 top-12 min-w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                    <Link
                      href="/app"
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-[#111827] transition hover:bg-[#f9fafb]"
                      onClick={() => setIsProfileMenuOpen(false)}
                    >
                      Go to app
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        void signOut({ callbackUrl: "/" });
                      }}
                      className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-[#111827] transition hover:bg-[#f9fafb]"
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void signIn("google")}
                className="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:text-black"
              >
                Sign in
              </button>
            )}

            {session ? (
              <Link
                href="/app"
                className="inline-flex items-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Go to app →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void signIn("google")}
                className="inline-flex items-center rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Start for free →
              </button>
            )}
          </div>
        </div>
      </header>

      <section ref={heroRef} className="flex min-h-screen items-center bg-white pb-14 pt-28 sm:pb-16">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="mx-auto inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">
            Powered by Gemini 2.5 Pro + Flash · Google ADK
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

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-700">
                    <AgentIcon id={card.id} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-black">{card.name}</h3>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      card.modelTier === "pro"
                        ? "bg-[#eff6ff] text-[#1d4ed8]"
                        : "bg-[#f3f4f6] text-[#6b7280]"
                    }`}
                  >
                    {card.modelBadge}
                  </span>
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
                key={tech.label}
                title={tech.title}
                className={`inline-flex rounded-full border bg-white px-4 py-2 text-sm font-medium ${
                  tech.tone === "pro"
                    ? "border-[#93c5fd] text-[#1d4ed8]"
                    : "border-gray-300 text-gray-700"
                }`}
              >
                {tech.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f9fafb] py-20 sm:py-24">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:px-8">
          <div>
            <p className="inline-flex rounded-full border border-[#e5e7eb] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              BEHIND THE BUILD
            </p>
            <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-black md:text-5xl">
              From idea to deployed product in under 6 hours.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#4b5563] md:text-lg">
              HuntR was built solo in April 2026 - from blank repo to production-deployed
              multi-agent system in a single session.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "< 6 hrs",
                "5 agents",
                "2 deployments",
                "1 developer",
              ].map((stat) => (
                <span
                  key={stat}
                  className="inline-flex rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-semibold text-[#374151]"
                >
                  {stat}
                </span>
              ))}
            </div>

            <Link
              href="/build"
              className="mt-8 inline-flex items-center rounded-full border border-black px-6 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
            >
              Read the build story →
            </Link>
          </div>

          <div className="border-l-2 border-[#e5e7eb] pl-6 sm:pl-8">
            <ol className="space-y-6">
              <li>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Hour 1</p>
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  Core agent pipeline working in terminal
                </p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Hour 2</p>
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  FastAPI + SSE streaming + email delivery
                </p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Hour 3</p>
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  Dashboard deployed to Cloud Run + Vercel
                </p>
              </li>
              <li>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">Hour 3-6</p>
                <p className="mt-1 text-sm leading-relaxed text-[#374151]">
                  Intelligence upgrades + full product polish
                </p>
              </li>
            </ol>
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

      <section className="border-y border-gray-200 bg-white py-8">
        <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 md:text-left lg:px-8">
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">Built by</p>
            <p className="text-lg font-bold text-[#111827]">Mohan Prasath P</p>
            <p className="text-sm text-[#6b7280]">AI Builder</p>
            <p className="text-xs text-[#9ca3af]">April 2026</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <a
                href="https://github.com/mohanprasath-dev"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800"
              >
                GitHub
              </a>
              <a
                href="https://linkein.com/mohanprasath21"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800"
              >
                LinkedIn
              </a>
              <a
                href="https://www.mohanprasath.dev"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:text-gray-800"
              >
                Portfolio
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-lg font-semibold lowercase text-black">huntr</p>
            <p className="mt-1 text-sm text-gray-500">
              © 2026 HuntR by {" "}
              <a
                href="https://www.mohanprasath.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit transition hover:underline"
              >
                Mohan Prasath P
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <Link href="/build" className="transition hover:text-black">
              Build Story
            </Link>
            <a
              href="https://www.mohanprasath.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-black"
            >
              Portfolio
            </a>
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
