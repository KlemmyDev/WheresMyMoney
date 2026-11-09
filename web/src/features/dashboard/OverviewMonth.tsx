/**
 * The Overview's month (from the uplift canvas SfOverview): what's left in Spending against where it would usually be
 * by now, with the likely finish hatched, and the bills still to come this month with how well Bills covers them.
 * Money is framed by the month, never by the day.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { Card, CardHead, Details } from "~/features/common/ds";
import { dayDate, money, shortDate } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import type { Dashboard, SpendingMonth } from "~/features/common/types";
import { Pill, cn } from "~/features/common/ui";

const running = (vals: number[]) => {
  let t = 0;
  return vals.map((v) => (t += v));
};

/**
 * Spending, worked out: the Spending balance through the month so far, the path it usually takes (learned from the
 * spending before the month began, or the month's money spread evenly until there's enough history), and where it's
 * likely to finish, hatched.
 */
export function SpendingCard({ s }: { s: SpendingMonth }) {
  const e = s.expected;
  const learned = e.ready && e.daily.length === s.days;
  const today = s.day - 1;
  const perDay = learned ? e.daily : s.daily.map(() => Math.round(s.allowance / s.days));
  const expected = running(perDay);
  const start = s.left + s.spent;
  const usualNow = start - (expected[today] ?? 0);
  const diff = s.left - usualNow;
  const close = Math.abs(diff) < Math.max(start * 0.02, 2000);
  const likely = e.rest != null ? s.left - e.rest : null;
  const band = e.low != null && e.high != null ? [s.left - e.high, s.left - e.low] : null;
  const ahead = diff >= 0;
  return (
    <Card aria-labelledby="mo-h">
      <CardHead
        id="mo-h"
        title="Spending, worked out"
        right={
          likely != null && likely < 0 ? (
            <Pill tone="warn">Likely over</Pill>
          ) : (
            <Pill tone={close || ahead ? "good" : "warn"}>{close || ahead ? "On track" : "Behind"}</Pill>
          )
        }
      />
      <p className="m-0 text-[16px] leading-relaxed text-ink-2">
        You have <b className="text-ink">{money(s.left)}</b> left. By now it would usually be about {money(usualNow)}
        {close ? ", so you're about on track." : `, so you're ${money(Math.abs(diff))} ${ahead ? "ahead" : "behind"}.`}
      </p>
      <BalanceChart s={s} expected={expected} start={start} today={today} band={band} />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Figure label="Left in Spending now" value={money(s.left)} />
        <Figure label="Where it should be by now" value={`about ${money(usualNow)}`} />
        {likely != null && (
          <Figure
            label={`Likely left on ${dayDate(s.end)}${likely > 0 ? ", back to Offset" : ""}`}
            value={likely >= 0 ? `about ${money(likely)}` : `about ${money(-likely)} over`}
          />
        )}
      </div>
      <Details label="How it's worked out">
        <p className="m-0 text-[14px] text-ink-2">
          {learned
            ? "The usual path is learned from up to a year of your spending before this month began: recent weeks count most, each weekday has its own pattern (more on a Saturday, less on a Tuesday), and payments that repeat, like the gym or a subscription, are expected on their days. Spending you mark as a one-off is left out. It learns more each month."
            : `There isn't enough spending history to learn from yet (${e.history_days} of ${e.needs_days} days), so the usual path is the month's ${money(s.allowance)} spread evenly. A learned path takes over once there's enough.`}
          {e.accuracy != null &&
            ` Over the last four weeks it was ${Math.round(e.accuracy * 100)}% right, and the likely range is as wide as it has been wrong.`}
        </p>
      </Details>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-tile-2 p-3">
      <span className="text-[13px] text-ink-3">{label}</span>
      <span className="num text-[18px] text-ink">{value}</span>
    </div>
  );
}

const W = 600;
const H = 150;

/** The Spending balance across the month: solid so far, the usual path dashed, the likely finish hatched. */
function BalanceChart({
  s,
  expected,
  start,
  today,
  band,
}: {
  s: SpendingMonth;
  expected: number[];
  start: number;
  today: number;
  band: number[] | null;
}) {
  const n = s.days;
  const actual = running(s.daily)
    .slice(0, today + 1)
    .map((v) => start - v);
  const usual = expected.map((v) => start - v);
  const lows = band ? band[0] : s.left;
  const lo = Math.min(0, lows, ...usual, ...actual);
  const hi = Math.max(start, ...actual);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0);
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
  const path = (vals: number[], from = 0) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i + from).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  // The likely finish fans out from today to the month's end, between the low and high guesses.
  const fan = band ? `M${x(today)} ${y(s.left)} L${x(n - 1)} ${y(band[1])} L${x(n - 1)} ${y(band[0])} Z` : null;
  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[150px] w-full"
        role="img"
        aria-label={`Spending balance this month: ${money(s.left)} left now${band ? `, likely ${money(Math.max(0, band[0]))} to ${money(band[1])} by ${shortDate(s.end)}` : ""}`}
      >
        <defs>
          <pattern id="mo-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-spending-fill)" fillOpacity="0.08" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-spending-fill)" strokeWidth="2" strokeOpacity="0.5" />
          </pattern>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
        {fan && <path d={fan} fill="url(#mo-hatch)" />}
        <path
          d={path(usual)}
          fill="none"
          stroke="var(--color-ink-3)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(actual)}
          fill="none"
          stroke="var(--color-spending-fill)"
          strokeWidth={2.6}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <line x1={x(today)} x2={x(today)} y1="0" y2={H} stroke="var(--color-ink-3)" strokeOpacity="0.5" />
      </svg>
      <div className="mono flex justify-between text-xs text-ink-3">
        <span>{shortDate(s.start)}</span>
        <span>Today</span>
        <span>{shortDate(s.end)}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="w-4 border-t-2 border-spending-fill" /> Left in Spending
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 border-t-2 border-dashed border-ink-3" /> Usual path
        </span>
        {band && (
          <span className="flex items-center gap-1.5">
            <i className="hatched h-3 w-3 rounded-sm" style={{ ["--c" as string]: "var(--color-spending-fill)" }} />{" "}
            Likely
          </span>
        )}
      </div>
    </div>
  );
}

const HOW: Record<string, string> = {
  manual: "Pay by hand",
  estimate: "Amount varies",
};

/**
 * The bills still to come this month and how well the Bills account covers them. `compact` (the spot beside the
 * balance) shows the next six.
 */
export function ComingUp({
  d,
  compact = false,
  className = "md:col-span-6",
}: {
  d: Dashboard;
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const end = d.spending?.end ?? d.today;
  const all = d.due.items.filter((b) => b.date >= d.today && b.date <= end);
  const rows = compact ? all.slice(0, 6) : all;
  const total = all.reduce((t, b) => t + b.amount, 0);
  const held = d.bills?.balance ?? null;
  const until = `before ${shortDate(end)}`;
  return (
    <Card aria-labelledby={compact ? "up-h-compact" : "up-h"} className={className}>
      <CardHead
        id={compact ? "up-h-compact" : "up-h"}
        title="Coming up"
        right={
          <Link to="/bills" className="text-[14px] font-semibold text-teal no-underline">
            All bills
          </Link>
        }
      />
      <p className="m-0 -mt-1 text-[14px] text-ink-2">
        {all.length === 0
          ? `No more bills ${until}.`
          : held == null
            ? `${money(total)} still to come ${until}.`
            : held >= total
              ? `${money(total)} still to come ${until}. Bills covers it, with ${money(held - total)} left after.`
              : `${money(total)} still to come ${until}. Bills is ${money(total - held)} short of it.`}
      </p>
      <div className={cn("-mx-1", compact ? "grid grid-cols-1 gap-x-2 sm:max-md:grid-cols-2" : "flex flex-col")}>
        {rows.map((b) => (
          <button
            key={`${b.bill_id}-${b.date}`}
            type="button"
            onClick={() => navigate({ to: "/bills/$billId", params: { billId: String(b.bill_id) } })}
            className={cn(
              "chip-host press flex min-w-0 cursor-pointer items-center rounded-2xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2",
              compact ? "min-h-13 gap-2.5" : "min-h-16 gap-3",
            )}
          >
            <Chip g={I.bills} tone="bills" size={compact ? "md" : "lg"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{b.name}</span>
              <span className={cn("block truncate text-[13px]", b.how === "manual" ? "text-warn" : "text-ink-3")}>
                {dayDate(b.date)} · {HOW[b.how] ?? "Auto-pay"}
              </span>
            </span>
            {b.how === "estimate" ? (
              <span
                className="hatched num shrink-0 rounded-lg px-2 py-0.5 whitespace-nowrap"
                style={{ ["--c" as string]: "var(--color-bills-fill)" }}
              >
                about {money(b.amount)}
              </span>
            ) : (
              <span className="num shrink-0 whitespace-nowrap">−{money(b.amount, { cents: true })}</span>
            )}
          </button>
        ))}
      </div>
      {all.length > rows.length && (
        <Link to="/bills" className="-mt-1 text-[13px] font-semibold text-teal no-underline">
          {all.length - rows.length} more before the month ends
        </Link>
      )}
    </Card>
  );
}
