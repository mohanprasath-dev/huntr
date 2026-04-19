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
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] md:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((stat) => {
          const accentClasses =
            stat.tone === "accent"
              ? "border-[#bfdbfe] bg-[#eff6ff]"
              : "border-[#e5e7eb] bg-[#f9fafb]";

          return (
            <div
              key={stat.label}
              className={`rounded-xl border px-4 py-3 transition-colors ${accentClasses}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-[#6b7280]">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[#111827]">
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}


