/**
 * The Overview's new pieces (Nightfall): the balance hero with account filter and hide toggle, quick actions, accounts
 * with trend lines, and savings goals as rings. Built only from the design system (ds.tsx, icons.tsx).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  BigNumber,
  Card,
  CardHead,
  ChoiceChip,
  EmptyState,
  Eyebrow,
  IconButton,
  ROLE,
  Ring,
  type Role as DsRole,
} from "~/features/common/ds";
import { dayDate, money, pct, todayIso } from "~/features/common/format";
import { dashboardQuery } from "~/features/common/queries";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useActions } from "~/features/common/layout";
import { useStoredFlag } from "~/features/common/theme";
import type { Dashboard, Role } from "~/features/common/types";
import { Button, Pill, Segmented, cn } from "~/features/common/ui";
import { TopUpSheet, goalLook } from "~/features/goals/GoalFlows";

const ROLE_DS: Record<Role, DsRole> = {
  offset: "offset",
  bills: "bills",
  spending: "spending",
  savings: "savings",
  track: "ink",
};
const ROLE_TONE: Record<Role, Tone> = {
  offset: "offset",
  bills: "bills",
  spending: "spending",
  savings: "savings",
  track: "neutral",
};
const ROLE_GLYPH: Record<Role, Glyph> = {
  offset: I.offset,
  bills: I.bills,
  spending: I.accounts,
  savings: I.savings,
  track: I.list,
};

export function useHidden() {
  return useStoredFlag("wmm:hide-balances");
}

const mask = "$ ••••••";

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

const SPAN = { "30d": 30, "6m": 182, "1y": 365 } as const;
type Range = keyof typeof SPAN;

/** The day `daysAgo` days before today, as "Sat 7 Nov". */
function ago(daysAgo: number) {
  const d = new Date(`${todayIso()}T12:00:00`);
  d.setDate(d.getDate() - daysAgo);
  return dayDate(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );
}

const EYE_OPEN = (
  <>
    <path
      d="M2.5 12C3.5 10.5 7 6 12 6s8.5 4.5 9.5 6c-1 1.5-4.5 6-9.5 6s-8.5-4.5-9.5-6z"
      fill="currentColor"
      fillOpacity={0.15}
    />
    <path d="M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />
  </>
);
const EYE_SHUT = (
  <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.5C4.6 8.8 3.2 10.7 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1" />
);

export function BalanceHero({ d }: { d: Dashboard }) {
  const [hide, setHide] = useHidden();
  const [pick, setPick] = useState<number | "all">("all");
  const [range, setRange] = useState<Range>("30d");
  const [pt, setPt] = useState<number | null>(null);
  // A longer trend comes from the same endpoint; the rest of the page keeps this month's figures.
  const longer = useQuery({ ...dashboardQuery(range), enabled: range !== "30d", placeholderData: keepPreviousData });
  const src = range === "30d" ? d : (longer.data ?? d);
  const accounts = d.accounts;
  const sparkOf = (id: number) => src.accounts.find((a) => a.id === id)?.spark ?? [];
  const sel = pick === "all" ? null : (accounts.find((a) => a.id === pick) ?? null);
  const total = sel ? sel.balance : accounts.reduce((t, a) => t + a.balance, 0);
  const sparks = accounts.map((a) => sparkOf(a.id));
  const len = Math.min(...sparks.map((s) => s.length).filter((n) => n > 0), Infinity);
  const spark = sel
    ? sparkOf(sel.id)
    : Number.isFinite(len)
      ? Array.from({ length: len }, (_, i) => sparks.reduce((t, s) => t + (s[s.length - len + i] ?? 0), 0))
      : [];
  const path = line(spark, 600, 140);
  const colour = sel ? ROLE[ROLE_DS[sel.role]] : ROLE.accent;
  const positive = accounts.filter((a) => a.balance > 0);
  const positiveTotal = positive.reduce((t, a) => t + a.balance, 0) || 1;
  const n = spark.length;
  const step = n > 1 ? (SPAN[range] - 1) / (n - 1) : 0;
  const lo = n ? Math.min(...spark) : 0;
  const hi = n ? Math.max(...spark) : 1;
  const yAt = (v: number) => 134 - ((v - lo) / (hi - lo || 1)) * 128;
  const at = pt != null && pt < n ? pt : null;
  const shown = at ?? n - 1;
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
  const rangeName = range === "30d" ? "month" : range === "6m" ? "6 months" : "year";
  return (
    <Card lit aria-labelledby="hero" className="md:col-span-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow id="hero">{sel ? sel.name : `Total across ${accounts.length} accounts`}</Eyebrow>
          <BigNumber size="xl" className="mt-1">
            {hide ? mask : money(total, { cents: true })}
          </BigNumber>
          <div className="mt-1 text-[13px] text-ink-3">
            {sel
              ? sel.offsets_loan
                ? "Offsets the loan"
                : "Doesn't offset the loan"
              : d.coverage.ratio != null
                ? `Offsets ${pct(d.coverage.ratio)} of the loan`
                : "Add the loan to see what this saves"}
          </div>
        </div>
        <IconButton label={hide ? "Show balances" : "Hide balances"} onClick={() => setHide(!hide)}>
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            {hide ? EYE_SHUT : EYE_OPEN}
          </svg>
        </IconButton>
      </div>
      <div role="group" aria-label="Show an account" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        <ChoiceChip pressed={pick === "all"} onClick={() => setPick("all")}>
          All
        </ChoiceChip>
        {accounts.map((a) => (
          <ChoiceChip
            key={a.id}
            pressed={pick === a.id}
            onClick={() => setPick(a.id)}
            g={ROLE_GLYPH[a.role]}
            tone={ROLE_TONE[a.role]}
            role={ROLE_DS[a.role]}
          >
            {a.name}
          </ChoiceChip>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-ink-3">Drag across the chart to read any day</span>
        <Segmented<Range>
          label="Range"
          value={range}
          onChange={(r) => {
            setRange(r);
            setPt(null);
          }}
          options={[
            { value: "30d", label: "1M" },
            { value: "6m", label: "6M" },
            { value: "1y", label: "1Y" },
          ]}
        />
      </div>
      {path && (
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${sel ? sel.name : "Total"} over the last ${rangeName}`}
          aria-valuemin={1}
          aria-valuemax={n}
          aria-valuenow={shown + 1}
          aria-valuetext={`${ago(Math.round((n - 1 - shown) * step))}: ${hide ? "hidden" : money(spark[shown])}`}
          onPointerDown={scrub}
          onPointerMove={scrub}
          onPointerLeave={(e) => e.pointerType === "mouse" && setPt(null)}
          onKeyDown={onKey}
          className="relative h-[130px] cursor-ew-resize touch-pan-y rounded-xl outline-offset-4 select-none sm:h-[160px]"
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
                <span className="num block text-[14px] text-ink">
                  {hide ? "••••••" : money(spark[at], { cents: true })}
                </span>
              </span>
            </>
          )}
        </div>
      )}
      {!sel && positive.length > 1 && (
        <div>
          <div
            className="flex h-2.5 overflow-hidden rounded-full"
            role="img"
            aria-label={positive.map((a) => `${a.name} ${Math.round((a.balance / positiveTotal) * 100)}%`).join(", ")}
          >
            {positive.map((a) => (
              <span
                key={a.id}
                className="striped"
                style={{ width: `${(a.balance / positiveTotal) * 100}%`, backgroundColor: ROLE[ROLE_DS[a.role]] }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            {positive.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setPick(a.id)}
                className="press inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-1.5 text-[12px] text-ink-3 hover:text-ink"
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: ROLE[ROLE_DS[a.role]] }} />
                {a.name} {Math.round((a.balance / positiveTotal) * 100)}%
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Four square actions: the things you do most, in thumb reach on a phone. */
export function QuickActions() {
  const actions = useActions();
  const tile =
    "chip-host press flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border border-line bg-tile text-[12px] font-semibold text-ink-2 no-underline sm:flex-row sm:min-h-16 sm:justify-start sm:px-4 sm:text-[14px]";
  return (
    <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2.5">
      <button type="button" onClick={actions.addSpending} className={tile}>
        <Chip g={I.plus} tone="spending" size="lg" />
        Add
      </button>
      <button type="button" onClick={actions.checkin} className={tile}>
        <Chip g={I.shield} tone="offset" size="lg" />
        Check in
      </button>
      <Link to="/bills" className={tile}>
        <Chip g={I.bills} tone="bills" size="lg" />
        Pay a bill
      </Link>
      <Link to="/import" className={tile}>
        <Chip g={I.import} tone="neutral" size="lg" />
        Import
      </Link>
    </nav>
  );
}

export function AccountsCard({ d }: { d: Dashboard }) {
  const [hide] = useHidden();
  return (
    <Card aria-labelledby="ov-acc" className="md:col-span-6">
      <CardHead
        id="ov-acc"
        title="Accounts"
        right={
          <Link to="/accounts" className="text-[14px] font-semibold text-teal no-underline">
            All accounts
          </Link>
        }
      />
      <div className="-mx-1 flex flex-col">
        {d.accounts.map((a) => {
          const sp = line(a.spark, 80, 30, 3);
          return (
            <Link
              key={a.id}
              to="/accounts"
              className="chip-host press flex min-h-16 items-center gap-3 rounded-2xl px-1.5 text-ink no-underline hover:bg-tile-2"
            >
              <Chip g={ROLE_GLYPH[a.role]} tone={ROLE_TONE[a.role]} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.name}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {a.offsets_loan ? "Offsets the loan" : a.role === "track" ? "Tracked" : "Doesn't offset"}
                </span>
              </span>
              {sp && (
                <svg viewBox="0 0 80 30" width="80" height="30" aria-hidden className="hidden flex-none sm:block">
                  <path d={sp} fill="none" stroke={ROLE[ROLE_DS[a.role]]} strokeWidth={1.8} />
                </svg>
              )}
              <span className="flex flex-col items-end">
                <span className="num">{hide ? "••••••" : money(a.balance, { cents: true })}</span>
                {a.change_30d != null && a.change_30d !== 0 && (
                  <span className={cn("num text-[12px]", a.change_30d > 0 ? "text-good" : "text-ink-3")}>
                    {money(a.change_30d, { sign: true })} 30d
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export function GoalsCard({ d }: { d: Dashboard }) {
  const goals = d.savings?.goals ?? [];
  const { newGoal } = useActions();
  const [open, setOpen] = useState<number | null>(null);
  const openGoal = goals.find((g) => g.id === open) ?? null;
  return (
    <Card aria-labelledby="ov-goals">
      <CardHead
        id="ov-goals"
        title="Savings goals"
        right={goals.length ? <Pill tone="mute">{money(d.savings?.balance ?? 0)} saved</Pill> : undefined}
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
        <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {goals.map((g, i) => {
            const p = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const look = goalLook(g, i);
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => setOpen(g.id)}
                aria-label={`${g.name}: ${money(g.saved)} of ${money(g.target)}. Top up`}
                className="chip-host press flex w-[150px] flex-none cursor-pointer flex-col gap-2.5 rounded-[22px] border border-line bg-tile-2 p-3.5 text-left text-ink"
              >
                <span className="flex items-start justify-between">
                  <Ring value={p} role={look.role} label={`${g.name} ${Math.round(p)}%`}>
                    <span className="num text-[14px]">{Math.round(p)}%</span>
                  </Ring>
                  <Chip g={look.g} tone={look.tone} size="sm" />
                </span>
                <span>
                  <span className="block font-semibold">{g.name}</span>
                  <span className="block text-[13px] text-ink-3">
                    {money(g.saved)} of {money(g.target)}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={newGoal}
            className="chip-host press flex w-[150px] flex-none cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-line-2 bg-transparent p-3.5 text-ink-2"
          >
            <Chip g={I.plus} tone="neutral" size="lg" />
            <span className="font-semibold">New goal</span>
          </button>
        </div>
      )}
      <TopUpSheet goal={openGoal} index={goals.findIndex((g) => g.id === open)} onClose={() => setOpen(null)} />
    </Card>
  );
}
