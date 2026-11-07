/**
 * The Overview's new pieces (Nightfall): the balance hero with account filter and hide toggle, quick actions, accounts
 * with trend lines, and savings goals as rings. Built only from the design system (ds.tsx, icons.tsx).
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { money, pct } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useActions } from "~/features/common/layout";
import { useStoredFlag } from "~/features/common/theme";
import type { Dashboard, Role } from "~/features/common/types";
import { Pill, cn } from "~/features/common/ui";

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

export function BalanceHero({ d }: { d: Dashboard }) {
  const [hide, setHide] = useHidden();
  const [pick, setPick] = useState<number | "all">("all");
  const accounts = d.accounts;
  const sel = pick === "all" ? null : (accounts.find((a) => a.id === pick) ?? null);
  const total = sel ? sel.balance : accounts.reduce((t, a) => t + a.balance, 0);
  const len = Math.min(...accounts.map((a) => a.spark.length).filter((n) => n > 0), Infinity);
  const spark = sel
    ? sel.spark
    : Number.isFinite(len)
      ? Array.from({ length: len }, (_, i) =>
          accounts.reduce((t, a) => t + (a.spark[a.spark.length - len + i] ?? 0), 0),
        )
      : [];
  const path = line(spark, 600, 140);
  const colour = sel ? ROLE[ROLE_DS[sel.role]] : ROLE.accent;
  const positive = accounts.filter((a) => a.balance > 0);
  const positiveTotal = positive.reduce((t, a) => t + a.balance, 0) || 1;
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
            {hide ? (
              <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.5C4.6 8.8 3.2 10.7 2.5 12c1 1.5 4.5 6 9.5 6 1.6 0 3-.4 4.3-1" />
            ) : (
              <>
                <path
                  d="M2.5 12C3.5 10.5 7 6 12 6s8.5 4.5 9.5 6c-1 1.5-4.5 6-9.5 6s-8.5-4.5-9.5-6z"
                  fill="currentColor"
                  fillOpacity={0.15}
                />
                <path d="M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />
              </>
            )}
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
      {path && (
        <svg
          viewBox="0 0 600 140"
          preserveAspectRatio="none"
          className="block h-[120px] w-full sm:h-[150px]"
          role="img"
          aria-label={`${sel ? sel.name : "Total"} over recent weeks`}
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
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            {positive.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: ROLE[ROLE_DS[a.role]] }} />
                {a.name} {Math.round((a.balance / positiveTotal) * 100)}%
              </span>
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

const GOAL_ROLES: DsRole[] = ["offset", "spending", "savings", "invest", "bills"];

export function GoalsCard({ d }: { d: Dashboard }) {
  const goals = d.savings?.goals ?? [];
  return (
    <Card aria-labelledby="ov-goals" className="md:col-span-6">
      <CardHead
        id="ov-goals"
        title="Savings goals"
        right={goals.length ? <Pill tone="mute">{money(d.savings?.balance ?? 0)} saved</Pill> : undefined}
      />
      {goals.length === 0 ? (
        <EmptyState g={I.savings} tone="savings" title="No goals yet">
          Add goals to the savings account on the Accounts page, and they show up here as rings.
        </EmptyState>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {goals.map((g, i) => {
            const p = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
            return (
              <Link
                key={g.id}
                to="/accounts"
                className="chip-host press flex w-[150px] flex-none flex-col gap-2.5 rounded-[22px] border border-line bg-tile-2 p-3.5 text-ink no-underline"
              >
                <Ring value={p} role={GOAL_ROLES[i % GOAL_ROLES.length]} label={`${g.name} ${Math.round(p)}%`}>
                  <span className="num text-[14px]">{Math.round(p)}%</span>
                </Ring>
                <span>
                  <span className="block font-semibold">{g.name}</span>
                  <span className="block text-[13px] text-ink-3">
                    {money(g.saved)} of {money(g.target)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
