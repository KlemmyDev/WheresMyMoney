/**
 * The Overview's month: spending so far against what the forecast expected (app.features.spending.forecast), what's
 * coming up with how well Bills covers it, and recent activity. The chart reads by dragging, hovering or arrow keys.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, Card, CardHead, Details } from "~/features/common/ds";
import { ScrubChart } from "~/features/common/ScrubChart";
import { dayDate, money, shortDate } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { transactionsQuery } from "~/features/common/queries";
import type { Dashboard, Transaction } from "~/features/common/types";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";
import { Pill, cn } from "~/features/common/ui";
import type { Month } from "~/features/dashboard/DashboardPage";

const EVENT_GLYPH: Record<string, { g: Glyph; tone: Tone }> = {
  pay: { g: I.pay, tone: "savings" },
  topup: { g: I.transfer, tone: "offset" },
  bill: { g: I.bills, tone: "bills" },
};

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
  const expected = learned ? sum(e.daily) : s.daily.map((_, i) => Math.round((s.allowance * (i + 1)) / s.days));
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
      <ScrubChart
        label={`Spending this month, ${what} against actual, by day`}
        lines={[
          { values: actual, colour: "var(--color-spending-fill)", name: "Spent", fill: true },
          { values: expected, colour: "var(--color-ink-3)", name: learned ? "Expected" : "Plan", dashed: true },
        ]}
        at={(i) => dayDate(m.dates[i])}
        axisAt={(i) => shortDate(m.dates[i])}
        axis={[0, s.days - 1]}
        format={(v) => money(v)}
        floor={0}
        height={170}
        marks={m.today < s.days - 1 ? [{ i: m.today, label: "Today" }] : []}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-4 rounded-full bg-spending-fill" /> Spent
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-4 border-t-2 border-dashed border-ink-3" /> {learned ? "Expected" : "Plan"}
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
            ? "Expected is learned from up to a year of your spending before this month began: recent weeks count most, each weekday has its own pattern (more on a Saturday, less on a Tuesday), and payments that repeat, like the gym or a subscription, are expected on their days. It learns more each month."
            : `There isn't enough spending history to learn from yet (${e.history_days} of ${e.needs_days} days), so the line is the plan: the month's ${money(s.allowance)} spread evenly. An expected line takes over once there's enough.`}
          {e.accuracy != null &&
            ` Over the last four weeks it was ${Math.round(e.accuracy * 100)}% right, and the likely range is as wide as it has been wrong.`}
        </p>
      </Details>
    </Card>
  );
}

/**
 * Pay and bills still to come this month, and how well the Bills account covers the ones before pay. `compact` (the
 * spot beside the balance) tightens the rows, lays them out two across on a tablet and shows the next six.
 */
export function ComingUp({
  d,
  m,
  compact = false,
  className = "md:col-span-6",
}: {
  d: Dashboard;
  m: Month;
  compact?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const all = m.events.flatMap((evs, i) => (i > m.today ? evs.map((e) => ({ ...e, i })) : []));
  const rows = compact ? all.slice(0, 6) : all;
  const b = m.beforePay;
  const held = d.bills?.balance ?? null;
  const by = m.nextPay != null ? dayDate(m.dates[m.nextPay]) : "the next fortnight";
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
      <div className={cn("rounded-2xl border border-line bg-tile-2", compact ? "p-3" : "p-3.5")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">Before pay, {by}</span>
          {held != null && (
            <Pill tone={held >= b.total ? "good" : "warn"}>{held >= b.total ? "Covered" : "Short"}</Pill>
          )}
        </div>
        {held != null && (
          <div className="mt-2.5">
            <Bar
              label={`${money(b.total)} due of ${money(held)} in Bills`}
              max={Math.max(held, b.total, 1)}
              segments={[{ value: b.total, role: "bills" }]}
            />
          </div>
        )}
        <div className="mt-2 text-[13px] text-ink-3">
          {money(b.total)} due{held != null ? ` of ${money(held)} in Bills` : ""} · {b.count}{" "}
          {b.count === 1 ? "bill" : "bills"}
          {b.byHand ? ` · ${b.byHand} by hand` : ""}
        </div>
      </div>
      <div className={cn("-mx-1", compact ? "grid gap-x-2 sm:max-md:grid-cols-2" : "flex flex-col")}>
        {rows.map((r, k) => {
          const e = EVENT_GLYPH[r.kind];
          return (
            <button
              key={k}
              type="button"
              onClick={() =>
                r.kind === "bill" && r.bill_id != null
                  ? navigate({ to: "/bills/$billId", params: { billId: String(r.bill_id) } })
                  : navigate({ to: r.kind === "bill" ? "/bills" : "/rules" })
              }
              className={cn(
                "chip-host press flex cursor-pointer items-center rounded-2xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2",
                compact ? "min-h-13 gap-2.5" : "min-h-16 gap-3",
              )}
            >
              <Chip g={e.g} tone={e.tone} size={compact ? "md" : "lg"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.name}</span>
                <span className={cn("block text-[13px]", r.how === "Pay by hand" ? "text-warn" : "text-ink-3")}>
                  {dayDate(m.dates[r.i])}
                  {r.how ? ` · ${r.how}` : ""}
                </span>
              </span>
              {r.amount != null && (
                <span className={cn("num", r.kind === "pay" && "text-good")}>
                  {r.kind === "pay" ? "+" : "−"}
                  {money(r.amount, { cents: true })}
                </span>
              )}
            </button>
          );
        })}
        {!rows.length && (
          <span className="px-1.5 py-2 text-[13px] text-ink-3">Nothing else before the month ends.</span>
        )}
      </div>
      {all.length > rows.length && (
        <Link to="/bills" className="-mt-1 text-[13px] font-semibold text-teal no-underline">
          {all.length - rows.length} more before the month ends
        </Link>
      )}
    </Card>
  );
}

/** The latest few transactions across the household, newest first. */
export function RecentActivity() {
  const q = useQuery(transactionsQuery({ limit: 6 }));
  const [open, setOpen] = useState<Transaction | null>(null);
  return (
    <Card aria-labelledby="act-h" className="md:col-span-6">
      <CardHead
        id="act-h"
        title="Recent activity"
        right={
          <Link to="/transactions" className="text-[14px] font-semibold text-teal no-underline">
            See all
          </Link>
        }
      />
      <div className="-mx-1 flex flex-col">
        {(q.data ?? []).map((t) => (
          <TxRow key={t.id} tx={t} onOpen={setOpen} sub={shortDate(t.date)} />
        ))}
        {q.data && !q.data.length && <span className="px-1.5 py-2 text-[13px] text-ink-3">No transactions yet.</span>}
      </div>
      <TransactionSheet tx={open} onClose={() => setOpen(null)} />
    </Card>
  );
}
