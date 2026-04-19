import Link from "next/link";

const TIMELINE_ENTRIES = [
  {
    time: "Hour 0",
    title: "The Problem",
    description:
      "Most Indian startups can't afford a sales team. Manual B2B prospecting takes 3-4 hours daily and produces generic outreach that gets ignored. We decided to fix that.",
  },
  {
    time: "Hour 1",
    title: "Core Agent Pipeline",
    description:
      "Built 5 specialized Google ADK agents: Scout, Researcher, Scorer, Outreach, and Followup. Connected Serper and Tavily for real-time web intelligence. First end-to-end lead generated in terminal.",
  },
  {
    time: "Hour 2",
    title: "Self-Correction + API",
    description:
      "Added Manager Agent orchestration with automatic retry logic. Built FastAPI backend with SSE streaming for real-time agent trace. Connected Brevo SMTP for email delivery.",
  },
  {
    time: "Hour 3",
    title: "Dashboard + Deploy",
    description:
      "Built Next.js dashboard with live agent pipeline visualization. Deployed backend to Cloud Run, frontend to Vercel. First production hunt completed.",
  },
  {
    time: "Days 2-3",
    title: "Intelligence + Polish",
    description:
      "Upgraded Scout with India-specific query strategies. Added Firestore persistence, CSV export, email open tracking, voice input, campaign comparison, and full light theme.",
  },
  {
    time: "Final",
    title: "National-Level Product",
    description:
      "Landing page, build story, full responsiveness pass. HuntR is now a production-ready B2B sales automation platform.",
  },
] as const;

const TECH_DECISIONS = [
  {
    title: "Why Google ADK over CrewAI",
    description:
      "Google ADK was directly taught in our NIAT curriculum and integrates natively with Vertex AI Gemini 2.5 Flash - giving us enterprise-grade reasoning without additional cost.",
  },
  {
    title: "Why SSE over WebSockets",
    description:
      "Server-Sent Events are simpler, more reliable, and perfectly suited for one-directional agent trace streaming. No connection management overhead.",
  },
  {
    title: "Why Firestore over PostgreSQL",
    description:
      "Firestore's schemaless nature matched our evolving lead data structure. Zero configuration, auto-scaling, native GCP integration.",
  },
] as const;

const BUILD_STATS = [
  "57+ leads found in testing",
  "163 seconds average pipeline time",
  "5 agents, 0 human intervention",
  "Built in < 6 hours",
] as const;

export default function BuildStoryPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-16 sm:px-6 lg:px-8">
        <header className="border-b border-slate-200 pb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            AGENTATHON 2026 · BUILD STORY
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            How HuntR was built
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            From idea to deployed product in under 6 hours.
          </p>
        </header>

        <section aria-labelledby="timeline-heading" className="pt-12">
          <h2 id="timeline-heading" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Build timeline
          </h2>

          <div className="relative mt-8">
            <div aria-hidden className="absolute bottom-2 left-[0.35rem] top-3 w-px bg-slate-200" />

            <ol>
              {TIMELINE_ENTRIES.map((entry) => (
                <li key={`${entry.time}-${entry.title}`} className="relative pb-10 pl-10 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 h-3 w-3 rounded-full border-2 border-slate-900 bg-white"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{entry.time}</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">{entry.title}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
                    {entry.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="decisions-heading" className="pt-14">
          <h2 id="decisions-heading" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Key technical decisions
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {TECH_DECISIONS.map((decision) => (
              <article
                key={decision.title}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
              >
                <h3 className="text-lg font-semibold tracking-tight text-slate-900">{decision.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{decision.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Build stats" className="pt-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BUILD_STATS.map((stat) => (
              <div
                key={stat}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-800"
              >
                {stat}
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 flex flex-col gap-3 border-t border-slate-200 pt-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="font-medium text-slate-700 transition hover:text-slate-900">
            Back to main site
          </Link>
          <a
            href="https://github.com/mohanprasath-dev/huntr"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-700 transition hover:text-slate-900"
          >
            GitHub
          </a>
        </footer>
      </div>
    </main>
  );
}