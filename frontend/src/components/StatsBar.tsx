interface StatsBarProps {
  leadsFound: number;
  leadsScored: number;
  emailsReady: number;
  sentCount: number;
}

interface StatItem {
  label: string;
  value: number;
  tone: "accent" | "neutral";
}

export default function StatsBar({
  leadsFound,
  leadsScored,
  emailsReady,
  sentCount,
}: StatsBarProps) {
  const stats: StatItem[] = [
    { label: "Leads Found", value: leadsFound, tone: "accent" },
    { label: "Leads Scored", value: leadsScored, tone: "neutral" },
    { label: "Emails Ready", value: emailsReady, tone: "neutral" },
    { label: "Sent Count", value: sentCount, tone: "accent" },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-4 shadow-[0_14px_40px_rgba(0,0,0,0.45)] md:p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {stats.map((stat) => {
          const accentClasses =
            stat.tone === "accent"
              ? "border-accent/40 bg-accent/10"
              : "border-white/10 bg-white/3";

          return (
            <div
              key={stat.label}
              className={`rounded-xl border px-4 py-3 transition-colors ${accentClasses}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}


