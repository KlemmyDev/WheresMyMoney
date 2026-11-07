/**
 * The Overview (Nightfall, from the uplift canvas): your balances up top with an account filter, quick actions, then
 * this spending month. Three readouts
 * (safe to spend today, spent so far, bills before the next pay), the month day by day (money left as a line, what was
 * spent each day as bars, pay and bills underneath; hover or arrow through any day to see it on the right), where the
 * money went by category, and what's still to come before the next top-up.
 */
import { Loading } from "~/features/common/brand";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { errorMessage } from "~/features/common/api";
import { Count } from "~/features/common/charts";
import { dayDate, money, parseDate, shortDate } from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { dashboardQuery } from "~/features/common/queries";
import type { Dashboard, SpendingMonth } from "~/features/common/types";
import { Banner, Bar } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { Button, Empty, ErrorText, Pill, Tile, TileTitle, cn } from "~/features/common/ui";
import { AccountsCard, BalanceHero, GoalsCard, QuickActions } from "~/features/dashboard/OverviewParts";

type Event = { kind: "pay" | "bill" | "topup"; name: string; amount: number | null; how: string };

/** One spending month, day by day: what was spent, what's left after each day, and the pay and bills on it. */
type Month = {
  s: SpendingMonth;
  today: number;
  dates: string[];
  left: number[];
  events: Event[][];
  nextPay: number | null;
  beforePay: { total: number; count: number; byHand: number };
};

const CATEGORY_COLOURS = [
  "var(--color-spending)",
  "var(--color-offset)",
  "var(--color-bills)",
  "var(--color-rose)",
  "var(--color-sky)",
  "var(--color-savings)",
  "var(--color-teal)",
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, n: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** The dates a pay rule lands on between `from` and `to` (weekly, fortnightly and monthly pay). */
function payDates(anchor: string, every: string, from: string, to: string): string[] {
  const out: string[] = [];
  if (every === "weekly" || every === "fortnightly") {
    const step = every === "weekly" ? 7 : 14;
    const offset = Math.round((parseDate(from).getTime() - parseDate(anchor).getTime()) / 86400000);
    let d = addDays(anchor, Math.floor(offset / step) * step);
    while (d <= to) {
      if (d >= from) out.push(d);
      d = addDays(d, step);
    }
  } else if (every === "monthly") {
    const a = parseDate(anchor);
    for (let k = -2; k <= 2; k++) {
      const d = iso(new Date(parseDate(from).getFullYear(), parseDate(from).getMonth() + k, a.getDate()));
      if (d >= from && d <= to) out.push(d);
    }
  }
  return out;
}

function buildMonth(d: Dashboard, s: SpendingMonth): Month {
  const today = s.day - 1;
  const dates = s.daily.map((_, i) => addDays(s.start, i));
  // Left after each day: anchored on today's real balance, then the safe amount a day to the end.
  const spentTo: number[] = [];
  s.daily.reduce((acc, v, i) => (spentTo[i] = acc + v), 0);
  const left = s.daily.map((_, i) =>
    i <= today ? s.left + spentTo[today] - spentTo[i] : s.left - (i - today) * s.safe_per_day,
  );
  const events: Event[][] = s.daily.map(() => []);
  const names = Object.fromEntries(d.accounts.map((a) => [a.id, a.name]));
  if (s.top_up)
    events[0].push({ kind: "topup", name: `Topped up to ${money(s.top_up.amount)}`, amount: null, how: "" });
  const paydays: number[] = [];
  for (const r of d.rules)
    if (r.enabled && r.kind === "pay")
      for (const date of payDates(r.anchor, r.every, s.start, s.end)) {
        const i = dates.indexOf(date);
        if (i < 0) continue;
        paydays.push(i);
        events[i].push({
          kind: "pay",
          // "Salary into Offset": the rule's label (or "Pay") and where the money lands.
          name: `${r.label || "Pay"} into ${names[r.to_account ?? 0] ?? "your account"}`,
          amount: r.amount,
          how: "Payday",
        });
      }
  for (const b of d.due.items) {
    const i = dates.indexOf(b.date);
    if (i < 0) continue;
    events[i].push({
      kind: "bill",
      name: b.name,
      amount: b.amount,
      how: b.how === "manual" ? "Pay by hand" : b.how === "estimate" ? "Estimate" : "Direct debit",
    });
  }
  const nextPay = paydays.filter((i) => i > today).sort((a, b) => a - b)[0] ?? null;
  const until = nextPay != null ? dates[nextPay] : addDays(d.today, 14);
  const before = d.due.items.filter((b) => b.date >= d.today && b.date < until);
  return {
    s,
    today,
    dates,
    left,
    events,
    nextPay,
    beforePay: {
      total: before.reduce((a, b) => a + b.amount, 0),
      count: before.length,
      byHand: before.filter((b) => b.how === "manual").length,
    },
  };
}

export function DashboardPage() {
  const q = useQuery(dashboardQuery("30d"));
  const actions = useActions();
  const [hover, setHover] = useState<number | null>(null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  const d = q.data;
  if (!d) return <Loading />;
  if (!d.accounts.length)
    return (
      <Empty
        title="No accounts yet"
        action={
          <Link to="/setup" className="text-teal">
            Set up your accounts
          </Link>
        }
      >
        Add your accounts and the home loan, and the dashboard fills in.
      </Empty>
    );
  const s = d.spending;
  const checkinDue = d.checkin.next <= d.today && d.checkin.last?.date !== d.today;
  const flag = d.checkin.flags[0];
  const banner = (checkinDue || flag) && (
    <Banner
      g={flag ? I.rules : I.shield}
      tone={flag ? "bills" : "offset"}
      title={
        flag
          ? `${flag.account} was ${money(Math.abs(flag.difference))} ${flag.difference < 0 ? "short" : "over"}`
          : "Check-in due"
      }
      action={
        <Button primary onClick={actions.checkin}>
          Check in
        </Button>
      }
    >
      {flag
        ? `At the last check-in${flag.rule ? `: the ${flag.rule.label || "transfer"} didn't add up` : ""}.`
        : `${d.accounts.length} balances, about 30 seconds.`}
    </Banner>
  );
  if (!s)
    return (
      <>
        {banner}
        <Empty
          title="No spending account yet"
          action={
            <Link to="/accounts" className="text-teal">
              Give an account the spending role
            </Link>
          }
        >
          The dashboard follows your spending month: what's left, what's safe to spend today and what's still to come.
        </Empty>
      </>
    );
  const m = buildMonth(d, s);
  return (
    <>
      {banner}
      <div className="grid gap-4 md:grid-cols-12">
        <BalanceHero d={d} />
        <SafeToday m={m} />
      </div>
      <QuickActions />
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">This month</h2>
        <span className="text-[13px] text-ink-3">
          {shortDate(s.start)} – {shortDate(s.end)} · day {s.day} of {s.days}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
        <SpentSoFar m={m} />
        <BeforePay d={d} m={m} />
      </div>
      <Timeline m={m} hover={hover} setHover={setHover} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
        <Categories s={s} />
        <StillToCome m={m} hover={hover} setHover={setHover} />
      </div>
      <div className="grid gap-4 md:grid-cols-12">
        <AccountsCard d={d} />
        <GoalsCard d={d} />
      </div>
    </>
  );
}

function SafeToday({ m }: { m: Month }) {
  const s = m.s;
  return (
    <Tile
      i={1}
      aria-labelledby="b-safe"
      className="lit justify-center md:col-span-4"
      style={{
        background:
          "radial-gradient(420px 260px at 0% 0%, color-mix(in srgb, var(--color-accent-fill) 18%, transparent), transparent 70%), var(--color-tile)",
      }}
    >
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span aria-hidden className="pulse-ring size-2 rounded-full bg-teal" />
        <span id="b-safe">Safe to spend today</span>
      </div>
      <div className="mono text-[44px] leading-[48px] font-semibold tracking-[-0.045em] sm:text-[52px] sm:leading-[56px]">
        <Count k="dash:safe" value={s.safe_per_day} format={(v) => money(v, { cents: true })} />
      </div>
      <div className="text-[12.5px] text-ink-3">
        {s.remaining
          ? `${money(s.left)} left over ${s.remaining} ${s.remaining === 1 ? "day" : "days"}, so the month ends on budget`
          : "The last day of the month: whatever's left is yours"}
      </div>
      <div className="mt-2">
        {/* `projected` is what's likely left on the last day, so the likely spend still to come is left − projected. */}
        <Bar
          label={`Spent ${money(s.spent)}, likely ${money(Math.max(0, s.left - s.projected))} more, of ${money(s.allowance)}`}
          max={Math.max(s.allowance, s.spent + Math.max(0, s.left - s.projected), 1)}
          segments={[
            { value: s.spent, role: "spending" },
            { value: Math.max(0, s.left - s.projected), role: "spending", likely: true },
          ]}
        />
        <div className="mt-2 flex justify-between gap-2 text-[12px] text-ink-3">
          <span>Spent {money(s.spent)}</span>
          <span>▨ likely {money(Math.max(0, s.left - s.projected))}</span>
          <span className={s.projected >= 0 ? "text-good" : "text-warn"}>
            {s.projected >= 0 ? `~${money(s.projected)} spare` : `~${money(-s.projected)} short`}
          </span>
        </div>
      </div>
    </Tile>
  );
}

function SpentSoFar({ m }: { m: Month }) {
  const s = m.s;
  const over = s.vs_pace > 0;
  const share = s.allowance ? Math.min(s.spent / s.allowance, 1) : 0;
  return (
    <Tile i={2} aria-labelledby="b-spent">
      <TileTitle
        id="b-spent"
        right={
          <Pill tone={over ? "warn" : "good"}>
            {money(Math.abs(s.vs_pace))} {over ? "OVER" : "UNDER"} PACE
          </Pill>
        }
      >
        Spent so far
      </TileTitle>
      <div className="flex items-baseline gap-2">
        <span className="mono text-[30px] font-semibold">
          <Count k="dash:spent" value={s.spent} format={(v) => money(v)} />
        </span>
        <span className="text-[13px] text-ink-3">of {money(s.allowance)}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-raised">
        <i
          className="grow-x absolute inset-y-0 left-0 block rounded-full bg-spending"
          style={{ width: `${share * 100}%` }}
        />
        <i
          aria-hidden
          className="absolute -inset-y-1 w-0.5 rounded-full bg-ink"
          style={{ left: `calc(${s.pace * 100}% - 1px)` }}
        />
      </div>
      <div className="mono text-[10.5px] text-ink-3">WHITE MARK = WHERE AN EVEN PACE WOULD BE TODAY</div>
    </Tile>
  );
}

function BeforePay({ d, m }: { d: Dashboard; m: Month }) {
  const b = m.beforePay;
  const held = d.bills?.balance ?? null;
  const by = m.nextPay != null ? dayDate(m.dates[m.nextPay]) : "the next fortnight";
  return (
    <Tile i={3} aria-labelledby="b-before">
      <TileTitle id="b-before">
        {m.nextPay != null ? "Bills before the next pay" : "Bills in the next fortnight"}
      </TileTitle>
      <div className="flex items-baseline gap-2">
        <span className="mono text-[30px] font-semibold">{money(b.total)}</span>
        <span className="text-[13px] text-ink-3">
          {b.count} {b.count === 1 ? "bill" : "bills"} by {by}
        </span>
      </div>
      <div className="text-[12.5px] text-ink-3">
        {held != null && (
          <>
            The Bills account holds <span className="mono text-ink">{money(held)}</span>
            {b.total > 0 && held >= b.total ? `, ${Math.floor(held / b.total)} times that` : ""}.{" "}
          </>
        )}
        {b.byHand > 0 && `${b.byHand === 1 ? "One needs" : `${b.byHand} need`} paying by hand.`}
      </div>
    </Tile>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      {swatch}
      {children}
    </span>
  );
}

function Timeline({ m, hover, setHover }: { m: Month; hover: number | null; setHover: (i: number | null) => void }) {
  const s = m.s;
  const n = s.days;
  const top = Math.max(s.allowance, ...m.left, 1);
  const y = (v: number) => 120 - (Math.max(v, 0) / top) * 110;
  const x = (i: number) => ((i + 0.5) / n) * 1000;
  const path = (pts: [number, number][]) =>
    pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const past = path([
    [0, y(s.allowance)],
    ...m.left.slice(0, m.today + 1).map((v, i) => [x(i), y(v)] as [number, number]),
  ]);
  const future = path(m.left.slice(m.today).map((v, i) => [x(m.today + i), y(v)] as [number, number]));
  const barTop = Math.max(s.even_per_day * 2.5, ...s.daily, 1);
  const sel = hover ?? m.today;
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover(Math.min(n - 1, Math.max(0, sel + (e.key === "ArrowRight" ? 1 : -1))));
  };
  return (
    <Tile i={4} aria-labelledby="b-tl" className="gap-3.5 p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="b-tl" className="m-0 text-base font-semibold">
          Money left, day by day
        </h2>
        <Legend swatch={<i className="h-0.5 w-3.5 bg-teal" />}>Left in Spending</Legend>
        <Legend swatch={<i className="size-2.5 rounded-[3px] bg-spending" />}>Spent</Legend>
        <Legend swatch={<i className="size-2.5 rounded-[3px] border border-dashed border-spending/60" />}>
          Safe amount to come
        </Legend>
        <Legend swatch={<i className="size-[9px] rounded-full bg-good" />}>Pay</Legend>
        <Legend swatch={<i className="size-[9px] rotate-45 bg-bills" />}>Bill due</Legend>
      </div>
      <div className="flex flex-wrap gap-[18px]">
        <div
          className="relative min-w-0 flex-[999_1_560px] rounded-lg outline-offset-4"
          tabIndex={0}
          role="group"
          aria-label="The month day by day. Use the left and right arrow keys to move between days."
          onKeyDown={onKey}
          onMouseLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
        >
          <div className="relative h-[130px]">
            <svg
              viewBox="0 0 1000 130"
              width="100%"
              height="130"
              preserveAspectRatio="none"
              aria-hidden
              className="absolute inset-0"
            >
              <line
                x1="0"
                x2="1000"
                y1="10"
                y2="10"
                stroke="var(--color-line)"
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
              />
              <line x1="0" x2="1000" y1="120" y2="120" stroke="var(--color-line)" vectorEffect="non-scaling-stroke" />
              <path
                d={past}
                fill="none"
                stroke="var(--color-teal)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pathLength={1000}
                className="draw"
                style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
              />
              {m.today < n - 1 && (
                <path
                  d={future}
                  fill="none"
                  stroke="var(--color-teal)"
                  strokeWidth="2"
                  strokeDasharray="5 6"
                  opacity="0.55"
                  vectorEffect="non-scaling-stroke"
                  className="fill-after"
                />
              )}
            </svg>
            <span className="mono absolute -top-0.5 left-1 text-[10px] text-ink-3">{money(top)}</span>
            <span
              aria-hidden
              className="absolute size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-teal bg-page transition-[left,top] duration-150"
              style={{ left: `${((sel + 0.5) / n) * 100}%`, top: y(m.left[sel]) }}
            />
          </div>
          <div className="mt-1.5 flex h-24 items-end gap-[3px]">
            {s.daily.map((v, i) => {
              const done = i <= m.today;
              const val = done ? v : s.safe_per_day;
              return (
                <div key={i} className="flex h-full flex-1 items-end">
                  <i
                    className={cn(
                      "block w-full rounded-t-[3px] transition-colors duration-150",
                      done ? "grow" : "fill-after border border-dashed border-spending/45",
                      done && (sel === i ? "bg-spending" : "bg-spending"),
                      !done && sel === i && "bg-spending/25",
                    )}
                    style={{ height: `max(3px, ${Math.min(val / barTop, 1) * 100}%)`, "--i": i } as CSSProperties}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex h-[26px] gap-[3px] border-t border-line pt-1.5">
            {m.events.map((evs, i) => (
              <div key={i} className="flex flex-1 justify-center gap-0.5">
                {evs.some((e) => e.kind !== "bill") && <i className="size-[9px] rounded-full bg-good" />}
                {evs.some((e) => e.kind === "bill") && <i className="mt-px size-2 rotate-45 bg-bills" />}
              </div>
            ))}
          </div>
          <div className="mono flex gap-[3px] text-[10px] text-ink-3">
            {m.dates.map((date, i) => (
              <span
                key={date}
                className={cn("flex-1 text-center whitespace-nowrap", i === m.today && "font-semibold text-teal")}
              >
                {i === m.today ? "TODAY" : i % 3 === 0 ? parseDate(date).getDate() : ""}
              </span>
            ))}
          </div>
          <div className="absolute inset-0 flex gap-[3px]">
            {m.dates.map((date, i) => (
              <div
                key={date}
                onMouseEnter={() => setHover(i)}
                className={cn(
                  "flex-1 rounded-md transition-colors duration-100",
                  sel === i ? "bg-ink/5" : i === m.today && "bg-teal/5",
                )}
              />
            ))}
          </div>
        </div>
        <DayDetail m={m} i={sel} />
      </div>
    </Tile>
  );
}

function DayDetail({ m, i }: { m: Month; i: number }) {
  const s = m.s;
  const done = i < m.today;
  const isToday = i === m.today;
  const evs = m.events[i];
  return (
    <aside
      aria-live="polite"
      className="flex min-w-[240px] flex-[1_1_260px] flex-col gap-3 rounded-xl border border-line bg-page p-4"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold">{dayDate(m.dates[i])}</span>
        <span
          className={cn(
            "mono ml-auto text-[10.5px] tracking-[0.08em]",
            isToday ? "text-teal" : done ? "text-ink-3" : "text-spending",
          )}
        >
          {isToday ? "TODAY" : done ? "DONE" : "AHEAD"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-[9px] bg-tile px-3 py-2.5">
          <span className="text-[11.5px] text-ink-3">{done || isToday ? "Spent" : "Safe to spend"}</span>
          <span className="mono text-[17px] font-semibold">
            {money(done || isToday ? s.daily[i] : s.safe_per_day, { cents: true })}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[9px] bg-tile px-3 py-2.5">
          <span className="text-[11.5px] text-ink-3">Left after</span>
          <span className="mono text-[17px] font-semibold text-teal">{money(m.left[i], { cents: true })}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {evs.map((e, k) => (
          <div key={k} className="flex items-center gap-2.5 text-[13px]">
            <i className={cn("size-2 flex-none", e.kind === "bill" ? "rotate-45 bg-bills" : "rounded-full bg-good")} />
            <span className="min-w-0 flex-1">{e.name}</span>
            {e.amount != null && (
              <span className="mono">
                {e.kind === "pay" ? "+" : ""}
                {money(e.amount, { cents: true })}
              </span>
            )}
          </div>
        ))}
        {!evs.length && <span className="text-[12.5px] text-ink-3">No pay or bills this day.</span>}
      </div>
      <span className="mt-auto text-xs text-ink-3">Hover any day, or use the arrow keys on the chart.</span>
    </aside>
  );
}

function Categories({ s }: { s: SpendingMonth }) {
  const [hover, setHover] = useState<number | null>(null);
  const cats = [
    ...s.categories
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((c, i) => ({ ...c, colour: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length] })),
    ...(s.unsorted > 0
      ? [{ id: -1, name: "Not sorted yet", budget: null, spent: s.unsorted, colour: "var(--color-out)" }]
      : []),
  ];
  const total = cats.reduce((a, c) => a + c.spent, 0);
  const C = 2 * Math.PI * 74;
  let at = 0;
  const shown = hover != null ? cats[hover] : null;
  return (
    <Tile i={5} aria-labelledby="b-cat" className="flex-row flex-wrap gap-[22px] p-5">
      <div className="relative size-[190px] flex-none">
        <svg viewBox="0 0 200 200" width="190" height="190" aria-hidden className="-rotate-90">
          <circle cx="100" cy="100" r="74" fill="none" stroke="var(--color-raised)" strokeWidth="22" />
          {cats.map((c, i) => {
            const len = total ? (c.spent / total) * C : 0;
            const el = (
              <circle
                key={c.id}
                cx="100"
                cy="100"
                r="74"
                fill="none"
                stroke={c.colour}
                strokeWidth={hover === i ? 30 : 22}
                strokeDasharray={`${Math.max(len - 3, 0)} ${C}`}
                strokeDashoffset={-at}
                opacity={hover == null || hover === i ? 1 : 0.3}
                className="fade-in transition-[stroke-width,opacity] duration-200 ease-[var(--ease-spring)]"
                style={{ animationDelay: `${i * 90}ms` }}
              />
            );
            at += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
          <span className="text-xs text-ink-3">{shown ? shown.name : "Spent"}</span>
          <span className="mono text-2xl font-semibold">{money(shown ? shown.spent : total)}</span>
          <span className="mono text-[11px] text-ink-3">
            {shown
              ? shown.budget
                ? `OF ${money(shown.budget)} BUDGET`
                : shown.id === -1
                  ? "NEEDS A CATEGORY"
                  : "NO BUDGET"
              : `${cats.length} ${cats.length === 1 ? "CATEGORY" : "CATEGORIES"}`}
          </span>
        </div>
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
        <h2 id="b-cat" className="m-0 mb-2 text-base font-semibold">
          Where it went
        </h2>
        <div onMouseLeave={() => setHover(null)} className="flex flex-col gap-0.5">
          {cats.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={cn(
                "flex cursor-default flex-col gap-1.5 rounded-lg border-0 px-2 py-[7px] text-left text-ink transition-colors duration-150",
                hover === i ? "bg-raised" : "bg-transparent",
              )}
            >
              <span className="flex w-full items-center gap-2 text-[13px]">
                <i className="size-[9px] rounded-[3px]" style={{ background: c.colour }} />
                {c.name}
                <span className="mono ml-auto text-xs text-ink-2">
                  {money(c.spent, { cents: true })}
                  {c.budget ? ` / ${money(c.budget)}` : ""}
                </span>
              </span>
              <span className="block h-[5px] w-full overflow-hidden rounded-[3px] bg-raised">
                <i
                  className="grow-x block h-full rounded-[3px]"
                  style={{
                    width: `${c.budget ? Math.min(c.spent / c.budget, 1) * 100 : 100}%`,
                    background: c.colour,
                    ["--i" as string]: i,
                  }}
                />
              </span>
            </button>
          ))}
          {!cats.length && <span className="px-2 text-[13px] text-ink-3">Nothing spent yet this month.</span>}
        </div>
      </div>
    </Tile>
  );
}

function StillToCome({ m, hover, setHover }: { m: Month; hover: number | null; setHover: (i: number | null) => void }) {
  const rows = m.events.flatMap((evs, i) => (i > m.today ? evs.map((e) => ({ ...e, i })) : []));
  const bills = rows.filter((r) => r.kind === "bill");
  return (
    <Tile i={6} aria-labelledby="b-come" className="p-5">
      <TileTitle
        id="b-come"
        right={
          <span className="mono text-ink-2">
            {money(
              bills.reduce((a, b) => a + (b.amount ?? 0), 0),
              { cents: true },
            )}{" "}
            · {bills.length} {bills.length === 1 ? "BILL" : "BILLS"}
          </span>
        }
      >
        Still to come this month
      </TileTitle>
      <div onMouseLeave={() => setHover(null)} className="flex flex-col">
        {rows.map((r, k) => {
          const date = parseDate(m.dates[r.i]);
          return (
            <button
              key={k}
              type="button"
              onMouseEnter={() => setHover(r.i)}
              onFocus={() => setHover(r.i)}
              onBlur={() => setHover(null)}
              className={cn(
                "flex cursor-default items-center gap-3 rounded-[9px] border-0 px-2 py-[9px] text-left text-ink transition-colors duration-150",
                hover === r.i ? "bg-raised" : "bg-transparent",
              )}
            >
              <span className="mono w-[50px] rounded-[7px] border border-line bg-page py-1 text-center text-[11px] leading-tight text-ink-2">
                {dayDate(m.dates[r.i]).slice(0, 3).toUpperCase()}
                <br />
                <span className="text-[15px] font-semibold text-ink">{date.getDate()}</span>
              </span>
              <span className="flex flex-col gap-px">
                <span className="text-[13.5px] font-medium">{r.name}</span>
                <span
                  className={cn(
                    "text-xs",
                    r.how === "Pay by hand" ? "text-warn" : r.kind === "pay" ? "text-good" : "text-ink-3",
                  )}
                >
                  {r.how}
                </span>
              </span>
              {r.amount != null && (
                <span className={cn("mono ml-auto text-[13.5px]", r.kind === "pay" && "text-good")}>
                  {r.kind === "pay" ? "+" : ""}
                  {money(r.amount, { cents: true })}
                </span>
              )}
            </button>
          );
        })}
        {!rows.length && <span className="px-2 py-2 text-[13px] text-ink-3">Nothing else before the next top-up.</span>}
      </div>
    </Tile>
  );
}
