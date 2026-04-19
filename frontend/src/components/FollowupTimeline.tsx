import type { FollowupItem } from "@/lib/huntr-types";

interface FollowupTimelineProps {
  sequence: FollowupItem[];
}

const DEFAULT_DAYS = [3, 7, 14];

function trimMessage(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

export default function FollowupTimeline({ sequence }: FollowupTimelineProps) {
  const byDay = new Map<number, FollowupItem>();
  for (const item of sequence) {
    byDay.set(item.day, item);
  }

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[#9ca3af]">Follow-up Sequence</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {DEFAULT_DAYS.map((day) => {
          const item = byDay.get(day);

          return (
            <article
              key={day}
              className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                Day {day}
              </p>
              <p className="mt-2 text-xs text-[#6b7280]">
                {item?.subject ? trimMessage(item.subject, 70) : "Planned touchpoint ready after first contact."}
              </p>
              {item?.message ? (
                <p className="mt-2 text-sm leading-relaxed text-[#374151]">
                  {trimMessage(item.message.replace(/\s+/g, " ").trim(), 120)}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}


