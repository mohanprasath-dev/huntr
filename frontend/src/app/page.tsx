import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(30,141,255,0.24),_transparent_55%),linear-gradient(180deg,#02050c_0%,#050d1c_45%,#03060d_100%)]" />

      <section className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col justify-center px-4 py-20 md:px-8">
        <p className="inline-flex w-fit rounded-full border border-accent/45 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
          HuntR Autonomous Pipeline
        </p>

        <h1 className="mt-6 max-w-5xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
          Convert intent signals into outbound-ready campaigns, fast.
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
          Launch a hunt, watch specialist agents score prospects, and generate personalized outreach from a
          single operational dashboard.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/app"
            className="inline-flex items-center rounded-lg border border-accent/60 bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2f7dff]"
          >
            Open App
          </Link>
          <Link
            href="/app/campaigns"
            className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/10"
          >
            View Campaigns
          </Link>
        </div>
      </section>
    </main>
  );
}
