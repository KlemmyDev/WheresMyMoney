/**
 * The Overview (Nightfall, from the uplift canvas): your balances up top with an account filter and safe to spend,
 * quick actions, then this spending month. Previously: three readouts
 * (safe to spend today, spent so far, bills before the next pay), the month day by day (money left as a line, what was
 * spent each day as bars, pay and bills underneath; hover or arrow through any day to see it on the right), where the
 * money went by category, and what's still to come before the next top-up.
 */
import { TodayCard } from "~/features/dashboard/Today";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { money, parseDate } from "~/features/common/format";
import { dashboardQuery } from "~/features/common/queries";
import type { Dashboard, SpendingMonth } from "~/features/common/types";
import { Empty, ErrorText } from "~/features/common/ui";
import { BalanceHero, GoalsCard } from "~/features/dashboard/OverviewParts";
import { ComingUp, MonthCard, RecentActivity, WhereItWent } from "~/features/dashboard/OverviewMonth";

type Event = { kind: "pay" | "bill" | "topup"; name: string; amount: number | null; how: string; bill_id?: number };

/** One spending month, day by day: what was spent, what's left after each day, and the pay and bills on it. */
export type Month = {
  s: SpendingMonth;
  today: number;
  dates: string[];
  left: number[];
  events: Event[][];
  nextPay: number | null;
  beforePay: { total: number; count: number; byHand: number };
};

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
      bill_id: b.bill_id,
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
  const [sel, setSel] = useState<number | null>(null);
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
        Add your accounts and the home loan, and the Overview fills in.
      </Empty>
    );
  const s = d.spending;
  const m = s ? buildMonth(d, s) : null;
  // The account total leads, with today's plain answers beside it; then the month, what's coming and where it went.
  return (
    <>
      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <BalanceHero d={d} />
        <TodayCard d={d} m={m} />
      </div>
      {s && m && (
        <>
          <MonthCard m={m} sel={sel} setSel={setSel} />
          <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
            <ComingUp d={d} m={m} />
            <WhereItWent s={s} />
          </div>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <div className="md:col-span-7">
          <RecentActivity />
        </div>
        <div className="md:col-span-5">
          <GoalsCard d={d} />
        </div>
      </div>
    </>
  );
}
