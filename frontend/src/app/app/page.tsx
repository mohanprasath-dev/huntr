import type { Metadata } from "next";
import Link from "next/link";
import CampaignForm from "@/components/CampaignForm";
import CampaignHistory from "@/components/CampaignHistory";
import LiveStats from "@/components/LiveStats";

export const metadata: Metadata = {
  title: "Launch Hunt",
  description: "Start an autonomous B2B lead generation campaign with 5 AI agents.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f9fafb]">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-12 pt-10 md:px-8 md:pt-14">
        <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:p-8">
            <p className="inline-flex rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#111827]">
              HUNTR CONTROL CENTER
            </p>
            <h1 className="mt-5 max-w-4xl text-2xl font-bold tracking-tight text-[#111827]">
              Autonomous client acquisition, shipped like a funded product.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#6b7280]">
              Configure your campaign once, then watch five specialized agents discover, qualify,
              and draft outbound for your highest-intent prospects in real time.
            </p>
            <p className="mt-3 max-w-2xl font-mono text-xs text-[#9ca3af]">
              Manager + Outreach → Gemini 2.5 Pro · Scout + Researcher + Scorer → Gemini 2.5 Flash
            </p>

            <div className="mt-7">
              <LiveStats />
            </div>
          </div>

          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:p-5">
            <CampaignForm />
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#111827] md:text-3xl">
                Recent Campaigns
              </h2>
              <p className="mt-2 text-sm text-[#6b7280]">
                Resume previous hunts and review outcomes at a glance.
              </p>
            </div>
            <Link
              href="/app/campaigns"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0066ff] transition hover:text-[#0052cc]"
            >
              View all →
            </Link>
          </div>
          <div className="mt-4">
            <CampaignHistory showViewAllLink={false} />
          </div>
        </section>
      </div>
    </main>
  );
}


