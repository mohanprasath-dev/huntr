import CampaignForm from "@/components/CampaignForm";
import CampaignHistory from "@/components/CampaignHistory";
import LiveStats from "@/components/LiveStats";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-2xl px-4 pb-12 pt-10 md:px-8 md:pt-14">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
        <div>
          <p className="inline-flex rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
            HuntR Control Center
          </p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Autonomous client acquisition, shipped like a funded product.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            Configure your campaign once, then watch five specialized agents discover, qualify,
            and draft outbound for your highest-intent prospects in real time.
          </p>

          <div className="mt-7">
            <LiveStats />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-panel-elevated/70 p-4 backdrop-blur md:p-5">
          <CampaignForm />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          Recent Campaigns
        </h2>
        <p className="mt-2 text-sm text-muted">
          Resume previous hunts and review outcomes at a glance.
        </p>
        <div className="mt-4">
          <CampaignHistory />
        </div>
      </section>
    </main>
  );
}


