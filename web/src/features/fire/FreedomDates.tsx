/**
 * The household's two freedom dates from the engine (today's path, and with the plan), as one strip that other
 * pages show so every page agrees. Links to Early retirement.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { fireQuery, type FireSummary } from "~/features/fire/api";

const when = (s: FireSummary | null) => (s ? `${s.retire_age} · ${s.retire_year}` : "Not by 70");

export function FreedomDates() {
  const q = useQuery(fireQuery);
  const f = q.data;
  if (!f || !f.ready) return null;
  return (
    <Link
      to="/early-retirement"
      aria-label={`Your freedom date: today's path ${when(f.today)}, with the plan ${when(f.plan)}. Open Early retirement.`}
      className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-line bg-tile px-4 py-3 text-ink no-underline hover:border-line-2"
    >
      <span className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Your freedom date</span>
      <span className="text-[14px]">
        Today&apos;s path <b className="num">{when(f.today)}</b>
      </span>
      <span className="text-[14px]">
        With the plan <b className="num text-savings">{when(f.plan)}</b>
      </span>
      <span className="ml-auto text-[13px] font-semibold text-teal">Early retirement →</span>
    </Link>
  );
}
