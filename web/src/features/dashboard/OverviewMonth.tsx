/**
 * The Overview's month: spending so far against what the forecast expected (app.features.spending.forecast), day by
 * day, and the bills still to come this month with how well Bills covers them. Charts read by hovering, dragging or the
 * arrow keys.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Card, CardHead, Details } from "~/features/common/ds";
import { dayDate, money, shortDate } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import type { Dashboard, SpendingMonth } from "~/features/common/types";
import { MarkPaid } from "~/features/bills/MarkPaid";
import { cn } from "~/features/common/ui";

/** One spending month, day by day: its figures, which day is today, and each day's date. */
export type Month = { s: SpendingMonth; today: number; dates: string[] };

/**
 * Spending this month: what's gone so far against what the forecast expected by each day. The expected line is learned
 * only from the spending before the month began, so it's a fair test of it; until there's enough history to learn
 * from, the plan (the month's money spread evenly) stands in for it.
 */
export function MonthCard({ m }: { m: Month }) {
  const s = m.s;
  const e = s.expected;
  const learned = e.ready && e.daily.length === s.days;
  const sum = (vals: number[]) => {
    let t = 0;
    return vals.map((v) => (t += v));
  };
  const actual = sum(s.daily).map((v, i) => (i <= m.today ? v : null));
  // Each day's expected spend: learned, or until then the plan (the month's money spread evenly).
  const perDay = learned ? e.daily : s.daily.map(() => Math.round(s.allowance / s.days));
  const expected = sum(perDay);
  const byNow = expected[m.today] ?? 0;
  const diff = s.spent - byNow;
  const close = Math.abs(diff) < Math.max(byNow * 0.03, 1000);
  const finish = e.rest != null ? s.spent + e.rest : null;
  const range = e.low != null && e.high != null ? [s.spent + e.low, s.spent + e.high] : null;
  const what = learned ? "expected" : "planned";
  return (
    <Card aria-labelledby="mo-h">
      <CardHead
        id="mo-h"
        title="Spending this month"
        right={
          <span className="text-[13px] text-ink-3">
            {shortDate(s.start)} – {shortDate(s.end)} · day {s.day} of {s.days}
          </span>
        }
      />
      <p className="m-0 text-[16px] text-ink-2">
        You've spent <span className="text-ink">{money(s.spent)}</span>
        {close
          ? `, about what was ${what} by now.`
          : diff < 0
            ? `, ${money(-diff)} less than ${what} by now.`
            : `, ${money(diff)} more than ${what} by now.`}
        {finish != null &&
          ` On your usual spending it'll finish around ${money(finish)}${
            finish > s.allowance ? `, over the ${money(s.allowance)} for the month.` : ` of the ${money(s.allowance)}.`
          }`}
      </p>
      <MonthChart m={m} perDay={perDay} actual={actual} expected={expected} name={learned ? "Expected" : "Plan"} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="striped h-3 w-2.5 rounded-[3px] bg-spending-fill [--c:var(--color-spending-fill)]" /> Spent
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3 w-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-ink-3)]" />
          <i className="-ml-0.5 w-4 border-t-2 border-dashed border-ink-3" /> {learned ? "Expected" : "Plan"}
        </span>
        {range && (
          <span>
            Likely {money(range[0])}–{money(range[1])} by {shortDate(s.end)}
          </span>
        )}
      </div>
      <Details label="How it's worked out">
        <p className="m-0 text-[14px] text-ink-2">
          {learned
            ? "Expected is learned from up to a year of your spending before this month began: recent weeks count most, each weekday has its own pattern (more on a Saturday, less on a Tuesday), and payments that repeat, like the gym or a subscription, are expected on their days. Spending you mark as a one-off is left out. It learns more each month."
            : `There isn't enough spending history to learn from yet (${e.history_days} of ${e.needs_days} days), so the line is the plan: the month's ${money(s.allowance)} spread evenly. An expected line takes over once there's enough.`}
          {e.accuracy != null &&
            ` Over the last four weeks it was ${Math.round(e.accuracy * 100)}% right, and the likely range is as wide as it has been wrong.`}
        </p>
      </Details>
    </Card>
  );
}

/**
 * The month day by day: a bar for what went each day over an outline of what was expected that day (hatched ahead of
 * today), and the running totals, spent and expected, as lines over them. Drag, hover or arrow through the days: the
 * day lights up and its figures show.
 */
function MonthChart({
  m,
  perDay,
  actual,
  expected,
  name,
}: {
  m: Month;
  perDay: number[];
  actual: (number | null)[];
  expected: number[];
  name: string;
}) {
  const s = m.s;
  const n = s.days;
  const [sel, setSel] = useState<number | null>(null);
  const barTop = Math.max(...perDay, ...s.daily.slice(0, m.today + 1), 1) * 1.1;
  const lineTop = Math.max(...expected, ...actual.map((v) => v ?? 0), 1) * 1.08;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 3 + (1 - v / lineTop) * 95;
  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v == null ? "" : `${i && vals[i - 1] != null ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`))
      .join(" ");
  const spentLine = line(actual);
  const pick = (ev: PointerEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setSel(Math.min(n - 1, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * n))));
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    setSel(Math.min(n - 1, Math.max(0, (sel ?? m.today) + (ev.key === "ArrowRight" ? 1 : -1))));
  };
  const day = sel ?? m.today;
  const gone = day <= m.today;
  const dotAt = gone ? actual[day] : expected[day];
  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="The month day by day. Drag across it, or use the arrow keys, to move between days."
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={day + 1}
        aria-valuetext={`${dayDate(m.dates[day])}: ${gone ? `spent ${money(s.daily[day])}, ` : ""}${name.toLowerCase()} ${money(perDay[day])}`}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(ev) => ev.pointerType === "mouse" && setSel(null)}
        onBlur={() => setSel(null)}
        onKeyDown={onKey}
        className="relative h-[200px] cursor-ew-resize touch-pan-y rounded-xl outline-offset-4 select-none sm:h-[230px]"
      >
        {/* The chosen day lights up, top to bottom. */}
        <div aria-hidden className="absolute inset-0 flex gap-[2px] sm:gap-[3px]">
          {perDay.map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-[6px] transition-colors duration-100",
                i === sel ? "bg-ink/8" : i === m.today && sel == null ? "bg-ink/4" : "",
              )}
            />
          ))}
        </div>
        <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-[42%] items-end gap-[2px] sm:gap-[3px]">
          {perDay.map((exp, i) => {
            const past = i < m.today;
            const isToday = i === m.today;
            const dim = sel != null && i !== sel;
            return (
              <div
                key={i}
                className={cn("relative h-full flex-1 transition-opacity duration-100", dim && "opacity-55")}
              >
                {/* What was expected that day: an outline (hatched where it's still ahead). */}
                <i
                  className={cn("absolute inset-x-0 bottom-0 block rounded-t-[4px]", !past && !isToday && "hatched")}
                  style={{
                    height: `max(3px, ${Math.min(exp / barTop, 1) * 100}%)`,
                    ["--c" as string]: "color-mix(in srgb, var(--color-ink-3) 60%, transparent)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-ink-3) 55%, transparent)",
                  }}
                />
                {/* What went. */}
                {(past || isToday) && (
                  <i
                    className={cn(
                      "absolute inset-x-px bottom-0 block rounded-t-[3px] sm:inset-x-[2px]",
                      past && "striped",
                    )}
                    style={{
                      height: s.daily[i] > 0 ? `max(3px, ${Math.min(s.daily[i] / barTop, 1) * 100}%)` : 0,
                      ["--c" as string]: "var(--color-spending-fill)",
                      ...(past ? { backgroundColor: "var(--color-spending-fill)" } : { background: "var(--grad)" }),
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="mo-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-spending-fill)" stopOpacity={0.22} />
              <stop offset="1" stopColor="var(--color-spending-fill)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {spentLine && (
            <path d={`${spentLine} L${x(m.today).toFixed(2)} 100 L${x(0).toFixed(2)} 100 Z`} fill="url(#mo-fill)" />
          )}
          <path
            d={line(expected)}
            fill="none"
            stroke="var(--color-ink-3)"
            strokeWidth={1.6}
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={spentLine}
            fill="none"
            stroke="var(--color-spending-fill)"
            strokeWidth={2.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        {m.today < n - 1 && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-ink-3/60"
            style={{ left: `${((m.today + 1) / n) * 100}%` }}
          >
            <span className="absolute top-0 left-1 text-[11px] text-ink-3">Today</span>
          </span>
        )}
        {sel != null && (
          <>
            {dotAt != null && (
              <span
                aria-hidden
                className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  left: `${x(sel)}%`,
                  top: `${y(dotAt)}%`,
                  boxShadow: `0 0 0 4px ${gone ? "var(--color-spending-fill)" : "var(--color-ink-3)"}`,
                }}
              />
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-line-2 bg-raised px-2.5 py-1.5 whitespace-nowrap shadow-[var(--shadow-float)]"
              style={{ left: `clamp(84px, ${x(sel)}%, calc(100% - 84px))` }}
            >
              <span className="block text-[11px] text-ink-3">
                {dayDate(m.dates[sel])}
                {sel === m.today ? " · today" : ""}
              </span>
              {gone && <Readout colour="var(--color-spending-fill)" label="Spent" value={s.daily[sel]} />}
              <Readout colour="var(--color-ink-3)" label={name} value={perDay[sel]} />
              <span className="mt-1 block border-t border-line pt-1 text-[11px] text-ink-3">
                {gone
                  ? `${money(actual[sel] ?? 0)} so far · ${money(expected[sel])} ${name.toLowerCase()}`
                  : `${money(expected[sel])} ${name.toLowerCase()} by then`}
              </span>
            </span>
          </>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>{shortDate(m.dates[0])}</span>
        <span>{shortDate(m.dates[n - 1])}</span>
      </div>
    </div>
  );
}

function Readout({ colour, label, value }: { colour: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px]">
      <i className="size-2 rounded-full" style={{ background: colour }} />
      <span className="text-ink-3">{label}</span>
      <span className="num ml-auto pl-2 text-ink">{money(value, { cents: true })}</span>
    </span>
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
  const total = all.filter((b) => !b.paid).reduce((t, b) => t + b.amount, 0);
  const held = d.bills?.balance ?? null;
  const until = `before ${shortDate(end)}`;
  return (
    <Card id="coming-up" aria-labelledby={compact ? "up-h-compact" : "up-h"} className={className}>
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
          <div
            key={`${b.bill_id}-${b.date}`}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-2xl px-1.5 hover:bg-tile-2",
              compact ? "min-h-13" : "min-h-16",
            )}
          >
            <button
              type="button"
              onClick={() => navigate({ to: "/bills/$billId", params: { billId: String(b.bill_id) } })}
              className={cn(
                "group chip-host press flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 text-left text-ink",
                compact ? "gap-2.5" : "gap-3",
              )}
              title={`${b.name}: ${money(b.amount, { cents: true })} due ${dayDate(b.date)}. Open the bill`}
            >
              <Chip g={I.bills} tone="bills" size={compact ? "md" : "lg"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{b.name}</span>
                <span
                  className={cn(
                    "block truncate text-[13px]",
                    b.how === "manual" && !b.paid ? "text-warn" : "text-ink-3",
                  )}
                >
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
            {(b.how === "manual" || b.paid) && <MarkPaid due={b} />}
          </div>
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
