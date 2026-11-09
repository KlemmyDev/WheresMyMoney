/**
 * The Overview's top half (Nightfall, from the uplift canvas SfOverview): the total balance with a sentence about how
 * each account is doing, Check in as its one action, and the savings goals as rings. Built only from the design system.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  BigNumber,
  Card,
  CardHead,
  Details,
  EmptyState,
  Eyebrow,
  ROLE,
  Ring,
  Stat,
  type Role as DsRole,
} from "~/features/common/ds";
import { dayDate, money, parseDate, pct, todayIso } from "~/features/common/format";
import { dashboardQuery, netWorthOf, netWorthQuery } from "~/features/common/queries";
import { I } from "~/features/common/icons";
import { useActions } from "~/features/common/layout";
import { useStoredFlag } from "~/features/common/theme";
import type { Dashboard, Role, Target } from "~/features/common/types";
import { Button, Segmented, cn } from "~/features/common/ui";
import { TopUpSheet, goalLook } from "~/features/goals/GoalFlows";

const ROLE_DS: Record<Role, DsRole> = {
  offset: "offset",
  bills: "bills",
  spending: "spending",
  savings: "savings",
  track: "ink",
};

/** Whether balances start hidden on this device (Settings, Appearance): for when someone else can see the screen. */
export function useHidden() {
  return useStoredFlag("wmm:hide-balances");
}

const MASK = "$ ••••••";

/** A line through `points`, scaled into a w×h box. */
function line(points: number[], w: number, h: number, pad = 6) {
  if (points.length < 2) return "";
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const r = hi - lo || 1;
  return points
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)} ${(h - pad - ((v - lo) / r) * (h - pad * 2)).toFixed(1)}`,
    )
    .join(" ");
}

const SPAN = { "30d": 30, "3m": 91, "6m": 182, "1y": 365 } as const;
type Range = keyof typeof SPAN;
const RANGE_WORDS: Record<Range, string> = { "30d": "a month", "3m": "3 months", "6m": "6 months", "1y": "a year" };

/** The day `daysAgo` days before today, as "Sat 7 Nov". */
function ago(daysAgo: number) {
  const d = new Date(`${todayIso()}T12:00:00`);
  d.setDate(d.getDate() - daysAgo);
  return dayDate(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );
}

type HeroAccount = Dashboard["accounts"][number];

/**
 * Is an account where its job says it should be? Bills against its months of bills; Spending against how the month is
 * going (it runs down by design, so its monthly amount isn't the test); Savings holds the goals, so it always is. The
 * offset's job (cover the loan) is said as a share instead, and accounts without a job aren't judged.
 */
function onAim(t: Target | null, spendingBehind: boolean): boolean | null {
  if (!t || t.kind === "loan") return null;
  if (t.kind === "allowance") return !spendingBehind;
  if (t.kind === "goals") return true;
  return t.progress >= 0.97;
}

function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "Spending, Bills and Savings are where they should be. Offset covers 12% of the loan." */
export function heroSentence(accounts: HeroAccount[], spendingBehind: boolean): string {
  const ok = accounts.filter((a) => onAim(a.target, spendingBehind) === true).map((a) => a.name);
  const parts: string[] = [];
  if (ok.length)
    parts.push(
      `${joinNames(ok)} ${ok.length === 1 ? "is" : "are"} where ${ok.length === 1 ? "it" : "they"} should be.`,
    );
  for (const a of accounts) {
    const t = a.target;
    if (!t || onAim(t, spendingBehind) === true) continue;
    if (t.kind === "loan") parts.push(`${a.name} covers ${pct(t.progress)} of the loan.`);
    else if (t.kind === "allowance") parts.push(`${a.name} is running behind for the month.`);
    else parts.push(`${a.name} is ${money(Math.max(0, t.amount - a.balance))} under its aim.`);
  }
  return parts.join(" ");
}

/** What each account's figure means, under See the numbers. */
function aimNote(a: HeroAccount): string {
  const t = a.target;
  if (!t) return a.offsets_loan ? "offsets the loan" : "kept apart";
  if (t.kind === "months")
    return t.held != null ? `${t.held.toFixed(1)} months, aim ${t.months}` : `aim ${t.months} months of bills`;
  if (t.kind === "allowance") return `of ${money(t.amount)} for the month`;
  if (t.kind === "goals") return `${t.count} ${t.count === 1 ? "goal" : "goals"}`;
  return `covers ${pct(t.progress)} of the loan`;
}

/** Days between two ISO dates. */
const daysBetween = (from: string, to: string) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);

export function BalanceHero({ d }: { d: Dashboard }) {
  const { checkin } = useActions();
  const [hidden] = useHidden();
  const show = (cents: number, opts?: { cents?: boolean }) => (hidden ? MASK : money(cents, opts));
  const [range, setRange] = useState<Range>("30d");
  const [pt, setPt] = useState<number | null>(null);
  // A longer trend comes from the same endpoint; the rest of the page keeps this month's figures.
  const longer = useQuery({ ...dashboardQuery(range), enabled: range !== "30d", placeholderData: keepPreviousData });
  const worth = useQuery(netWorthQuery("1y"));
  const src = range === "30d" ? d : (longer.data ?? d);
  const accounts = d.accounts;
  const total = accounts.reduce((t, a) => t + a.balance, 0);
  const sparks = accounts.map((a) => src.accounts.find((x) => x.id === a.id)?.spark ?? []);
  const len = Math.min(...sparks.map((s) => s.length).filter((n) => n > 0), Infinity);
  const spark = Number.isFinite(len)
    ? Array.from({ length: len }, (_, i) => sparks.reduce((t, s) => t + (s[s.length - len + i] ?? 0), 0))
    : [];
  const path = line(spark, 600, 140);
  const colour = ROLE.accent;
  const n = spark.length;
  const step = n > 1 ? (SPAN[range] - 1) / (n - 1) : 0;
  const lo = n ? Math.min(...spark) : 0;
  const hi = n ? Math.max(...spark) : 1;
  const yAt = (v: number) => 134 - ((v - lo) / (hi - lo || 1)) * 128;
  const at = pt != null && pt < n ? pt : null;
  const shown = at ?? n - 1;
  const delta = n > 1 ? spark[n - 1] - spark[0] : null;
  const last = d.checkin.last;
  const since = last ? daysBetween(last.date, d.today) : null;
  const w = worth.data?.now;
  const netWorth = w ? netWorthOf(w) : null;
  // Drag (or hover) along the chart to read any point; vertical swipes still scroll the page.
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPt(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPt(Math.min(n - 1, Math.max(0, shown + (e.key === "ArrowRight" ? 1 : -1))));
  };
  return (
    <Card lit aria-labelledby="hero" className="md:col-span-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow id="hero">
            Total balance · {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </Eyebrow>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <BigNumber size="xl">{show(total)}</BigNumber>
            {delta != null && !hidden && (
              <span className={delta >= 0 ? "num text-[15px] text-good" : "num text-[15px] text-bad"}>
                {delta >= 0 ? "+" : "−"}
                {money(Math.abs(delta))} in {RANGE_WORDS[range]}
              </span>
            )}
          </div>
        </div>
        <Segmented<Range>
          label="Range"
          value={range}
          onChange={(r) => {
            setRange(r);
            setPt(null);
          }}
          options={[
            { value: "30d", label: "1M" },
            { value: "3m", label: "3M" },
            { value: "6m", label: "6M" },
            { value: "1y", label: "12M" },
          ]}
        />
      </div>
      {!hidden && (
        <p className="m-0 max-w-[62ch] text-[16px] leading-relaxed text-ink-2">
          {heroSentence(accounts, (d.spending?.vs_pace ?? 0) > 0)}
        </p>
      )}
      {path && (
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Total balance over ${RANGE_WORDS[range]}`}
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={shown + 1}
          aria-valuetext={`${ago(Math.round((n - 1 - shown) * step))}: ${hidden ? "hidden" : money(spark[shown])}`}
          onPointerDown={scrub}
          onPointerMove={scrub}
          onPointerLeave={(e) => e.pointerType === "mouse" && setPt(null)}
          onKeyDown={onKey}
          className="relative h-[120px] cursor-ew-resize touch-pan-y rounded-xl outline-offset-4 select-none sm:h-[150px]"
        >
          <svg
            viewBox="0 0 600 140"
            preserveAspectRatio="none"
            className="absolute inset-0 block h-full w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="hero-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colour} stopOpacity={0.4} />
                <stop offset="1" stopColor={colour} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${path} L600 140 L0 140 Z`} fill="url(#hero-g)" />
            <path
              d={path}
              fill="none"
              stroke={colour}
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
          {at != null && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-3"
                style={{ left: `${(at / (n - 1)) * 100}%` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  left: `${(at / (n - 1)) * 100}%`,
                  top: `${(yAt(spark[at]) / 140) * 100}%`,
                  boxShadow: `0 0 0 4px ${colour}`,
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-xl border border-line-2 bg-raised px-2.5 py-1.5 whitespace-nowrap shadow-[var(--shadow-float)]"
                style={{ left: `clamp(64px, ${(at / (n - 1)) * 100}%, calc(100% - 64px))` }}
              >
                <span className="block text-[11px] text-ink-3">{ago(Math.round((n - 1 - at) * step))}</span>
                <span className="num block text-[14px] text-ink">{show(spark[at], { cents: true })}</span>
                {at > 0 && !hidden && (
                  <span className={cn("num block text-[11px]", spark[at] - spark[0] >= 0 ? "text-good" : "text-bad")}>
                    {spark[at] - spark[0] >= 0 ? "+" : "−"}
                    {money(Math.abs(spark[at] - spark[0]))} since {ago(Math.round((n - 1) * step))}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button primary onClick={checkin}>
          Check in
        </Button>
        <span className="text-[13px] text-ink-3">
          {last
            ? `Last check-in ${dayDate(last.date)}, ${since === 0 ? "today" : since === 1 ? "yesterday" : `${since} days ago`}`
            : "No check-in yet"}
        </span>
        {netWorth != null && (
          <Link to="/net-worth" className="ml-auto text-[14px] font-semibold text-teal no-underline">
            Net worth {show(netWorth)} →
          </Link>
        )}
      </div>
      <Details label="See the numbers">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {accounts.map((a) => (
            // Hover or focus a figure to see how it's moved over the last 30 days.
            <div key={a.id} tabIndex={0} className="group relative rounded-2xl outline-offset-2">
              <Stat label={a.name} value={show(a.balance)} note={aimNote(a)} role={ROLE_DS[a.role]} />
              {a.change_30d != null && !hidden && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line-2 bg-raised px-2.5 py-1.5 text-[12px] whitespace-nowrap opacity-0 shadow-[var(--shadow-float)] transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
                >
                  <span className="text-ink-3">Last 30 days </span>
                  <span className={cn("num", a.change_30d >= 0 ? "text-good" : "text-bad")}>
                    {a.change_30d >= 0 ? "+" : "−"}
                    {money(Math.abs(a.change_30d))}
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      </Details>
    </Card>
  );
}

export function GoalsCard({ d }: { d: Dashboard }) {
  const goals = d.savings?.goals ?? [];
  const { newGoal } = useActions();
  const [open, setOpen] = useState<number | null>(null);
  const openGoal = goals.find((g) => g.id === open) ?? null;
  const saved = goals.reduce((t, g) => t + g.saved, 0);
  const target = goals.reduce((t, g) => t + g.target, 0);
  const next = goals.find((g) => g.saved < g.target) ?? goals[0];
  return (
    <Card aria-labelledby="ov-goals">
      <CardHead
        id="ov-goals"
        title="Goals"
        right={
          goals.length ? (
            <span className="flex gap-2">
              <Button onClick={newGoal}>New goal</Button>
              {next && <Button onClick={() => setOpen(next.id)}>Top up</Button>}
            </span>
          ) : undefined
        }
      />
      {goals.length === 0 ? (
        <EmptyState
          g={I.savings}
          tone="savings"
          title="No goals yet"
          action={
            <Button primary onClick={newGoal}>
              New goal
            </Button>
          }
        >
          Split savings into goals, like a trip or a new car, and see each one fill up here.
        </EmptyState>
      ) : (
        <>
          <p className="m-0 -mt-1 text-[14px] text-ink-3">
            {money(saved)} of {money(target)} saved, in Savings
          </p>
          <div className="grid gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {goals.map((g, i) => {
              const p = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
              const look = goalLook(g, i);
              const planned = g.planned.reduce((t, m) => t + m.amount, 0);
              return (
                <Link
                  key={g.id}
                  to="/goals/$goalId"
                  params={{ goalId: String(g.id) }}
                  aria-label={`${g.name}: ${money(g.saved)} of ${money(g.target)}`}
                  className="group press flex min-h-16 cursor-pointer items-center gap-3 rounded-[18px] border border-line bg-tile-2 px-3 py-2.5 text-left text-ink no-underline transition-colors duration-150 hover:border-line-2 hover:bg-raised"
                >
                  <Ring value={p} size={52} role={look.role} label={`${g.name} ${Math.round(p)}%`}>
                    <span className="num text-[12px]">{Math.round(p)}%</span>
                  </Ring>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block truncate text-[13px] text-ink-3">
                      {money(g.saved)} of {money(g.target)} · {money(Math.max(0, g.target - g.saved))} to go
                    </span>
                    {planned > 0 && <span className="block text-[12px] text-teal">+{money(planned)} planned</span>}
                  </span>
                  <span
                    aria-hidden
                    className="flex-none text-[13px] font-semibold text-teal opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    Open →
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
      <TopUpSheet goal={openGoal} index={goals.findIndex((g) => g.id === open)} onClose={() => setOpen(null)} />
    </Card>
  );
}
