import CampaignForm from "@/components/CampaignForm";
import CampaignHistory from "@/components/CampaignHistory";
import LiveStats from "@/components/LiveStats";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f9fafb]">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-12 pt-10 md:px-8 md:pt-14">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:p-8">
            <p className="inline-flex rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#111827]">
              HUNTR CONTROL CENTER
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-[#111827] md:text-6xl">
              Autonomous client acquisition, shipped like a funded product.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#6b7280] md:text-lg">
              Configure your campaign once, then watch five specialized agents discover, qualify,
              and draft outbound for your highest-intent prospects in real time.
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
          <h2 className="text-2xl font-semibold tracking-tight text-[#111827] md:text-3xl">
            Recent Campaigns
          </h2>
          <p className="mt-2 text-sm text-[#6b7280]">
            Resume previous hunts and review outcomes at a glance.
          </p>
          <div className="mt-4">
            <CampaignHistory />
          </div>
        </section>
      </div>
    </main>
  );
}


