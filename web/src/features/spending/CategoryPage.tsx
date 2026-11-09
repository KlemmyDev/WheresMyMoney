/**
 * One category, looked at closely: what's gone on it over a timeframe (this month, or the last 3, 6 or 12 months) and
 * how that compares with the stretch before; month by month against its budget, with this month's likely finish
 * hatched; what's likely next month; its budget (set, change or take away, with what would fit); where it goes (its
 * merchants), its regular payments, which days of the week it goes on, and its transactions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead } from "~/features/common/ds";
import {
  EntityHeader,
  EntityHero,
  Legend,
  LikelyCard,
  WeekdaysCard,
  MONTH_RANGES,
  MonthBars,
  Timeframe,
  rangeName,
  useTimeframe,
  type MonthRange,
} from "~/features/common/entity";
import { dayDate, editable, longDate, money, monthYear, parseMoney, shortDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { categoryInsightsQuery, refresh } from "~/features/common/queries";
import type { CategoryInsights } from "~/features/common/types";
import { Button, Empty, ErrorText, Input, Pill, cn } from "~/features/common/ui";
import { CategoryGlyph, MerchantMark } from "~/features/spending/MerchantIcon";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

const FIRST = 12;
const RANGE_KEY = "wmm:category-range";

export function CategoryPage({ categoryId }: { categoryId: number }) {
  const [range, setRange] = useTimeframe<MonthRange>(RANGE_KEY, MONTH_RANGES, "3");
  const q = useQuery(categoryInsightsQuery(categoryId, Number(range)));
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const name = q.data?.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);
  const pick = (r: MonthRange) => {
    setRange(r);
    setAll(false);
  };
  if (q.isError)
    return (
      <Empty
        title="No page for that category"
        action={
          <Link to="/spending" className="text-teal">
            Back to Spending
          </Link>
        }
      >
        {errorMessage(q.error)}
      </Empty>
    );
  if (!q.data) return <Loading />;
  const d = q.data;
  const txs = all ? d.transactions : d.transactions.slice(0, FIRST);
  const openTx = d.transactions.find((t) => t.id === open) ?? null;
  return (
    <>
      <EntityHeader
        back={{ to: "/spending", label: "Spending" }}
        mark={<CategoryGlyph name={d.name} kind={d.kind} size="xl" />}
        title={d.name}
        sub={`${d.kind === "bills" ? "A bills category" : "A spending category"}${d.budget != null ? ` · ${money(d.budget)} a month budget` : " · no budget"}`}
        timeframe={<Timeframe options={MONTH_RANGES} value={range} onChange={pick} />}
      />

      <Hero d={d} />

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card className="md:col-span-8" aria-labelledby="cat-months">
          <CardHead
            id="cat-months"
            title="Month by month"
            right={
              <Legend
                items={[
                  { label: "Spent", kind: "solid", role: "spending" },
                  ...(d.likely.ready ? [{ label: "Likely", kind: "likely" as const, role: "spending" as const }] : []),
                  ...(d.budget != null ? [{ label: "Budget", kind: "line" as const, role: "ink" as const }] : []),
                ]}
              />
            }
          />
          <MonthChart d={d} />
        </Card>
        <Likely d={d} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-4">
        <Budget key={String(d.budget)} d={d} />
        <Merchants d={d} />
        <Regulars d={d} />
        <WeekdaysCard id="cat-week" values={d.weekdays} over={rangeName(d.range.months)} />
      </div>

      <Card aria-labelledby="cat-tx">
        <CardHead
          id="cat-tx"
          title={`Transactions · ${rangeName(d.range.months)}`}
          right={<span className="mono">{d.transactions.length}</span>}
        />
        <div>
          {txs.map((t) => (
            <TxRow key={t.id} tx={t} onOpen={(x) => setOpen(x.id)} sub={dayDate(t.date)} />
          ))}
          {!d.transactions.length && (
            <div className="text-[14px] text-ink-3">
              Nothing in {d.name} over {rangeName(d.range.months)}.
            </div>
          )}
        </div>
        {d.transactions.length > FIRST && (
          <div className="mt-2 flex justify-center">
            <Button onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : `Show all ${d.transactions.length}`}
            </Button>
          </div>
        )}
      </Card>
      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}

/** The timeframe in a sentence, and how it compares with the stretch before it. */
function Hero({ d }: { d: CategoryInsights }) {
  const r = d.range;
  const change = r.previous != null && r.previous > 0 ? (r.spent - r.previous) / r.previous : null;
  const before = r.months === 1 ? "the same days last month" : `the ${r.months} months before`;
  const perMonth = r.months > 1 ? Math.round(r.spent / r.months) : null;
  return (
    <EntityHero
      tint={d.kind === "bills" ? "bills" : "spending"}
      label={`${d.name} in a sentence`}
      numbers={[
        { label: "This month", value: money(d.this_month), note: `day ${d.day} of ${d.days}` },
        {
          label: "Usual month",
          value: money(d.average),
          note: d.average_months ? `last ${d.average_months} months` : "not enough yet",
        },
        { label: "Most in a month", value: money(d.highest), note: "of those" },
        {
          label: "Last 12 months",
          value: money(d.year),
          note: d.first ? `since ${monthYear(d.first.slice(0, 7))}` : "nothing yet",
        },
      ]}
    >
      <p className="m-0 text-[17px] leading-relaxed text-ink">
        We've spent <b>{money(r.spent)}</b> on {d.name} {r.months === 1 ? "so far this month" : rangeName(r.months)}
        {perMonth != null && (
          <>
            , about <b>{money(perMonth)} a month</b>
          </>
        )}
        .
      </p>
      <p className="m-0 text-[15px] text-ink-2">
        {r.count} {r.count === 1 ? "purchase" : "purchases"} since {longDate(r.start)}.{" "}
        {change == null
          ? r.previous === 0
            ? `Nothing went on it over ${before}.`
            : ""
          : Math.abs(change) < 0.05
            ? `About the same as ${before}.`
            : `That's ${money(Math.abs(r.spent - (r.previous ?? 0)))} ${change > 0 ? "more" : "less"} than ${before} (${change > 0 ? "up" : "down"} ${Math.round(Math.abs(change) * 100)}%).`}
        {d.average_months > 0 && ` A usual month is ${money(d.average)}.`}
      </p>
    </EntityHero>
  );
}

/** Bars for each month, this month's likely rest hatched on top, the budget as a dashed line; the timeframe is lit. */
function MonthChart({ d }: { d: CategoryInsights }) {
  const rest = d.likely.ready ? (d.likely.rest ?? 0) : 0;
  return (
    <MonthBars
      name={`What went on ${d.name}`}
      months={d.months.map((m) => ({ key: m.month, label: monthYear(m.month), value: m.spent }))}
      rest={rest}
      line={d.budget != null ? { value: d.budget, label: "Budget" } : undefined}
      role="spending"
      litFrom={d.range.start.slice(0, 7)}
      format={money}
      describe={(m, isNow) => (
        <>
          <b className="text-ink">{m.label}</b>: {money(m.value)}
          {isNow ? " so far" : ""}
          {isNow && rest > 0 ? `, likely about ${money(m.value + rest)} by the end` : ""}
          {d.budget != null && !isNow
            ? m.value > d.budget
              ? `, ${money(m.value - d.budget)} over the budget`
              : `, ${money(d.budget - m.value)} under the budget`
            : ""}
          .
        </>
      )}
    />
  );
}

/** Where this month is likely to finish, and next month. */
function Likely({ d }: { d: CategoryInsights }) {
  const l = d.likely;
  if (!l.ready)
    return (
      <LikelyCard
        id="cat-likely"
        className="md:col-span-4"
        notReady={
          l.history_days > 0
            ? `After ${l.needs_days - l.history_days} more days of ${d.name} we can say what's likely to go on it.`
            : `Nothing's gone on ${d.name} yet, so there's nothing to learn from.`
        }
      />
    );
  const total = l.month_total ?? d.this_month;
  const scale = Math.max(total, l.high ?? 0, d.budget ?? 0, 1);
  return (
    <LikelyCard
      id="cat-likely"
      className="md:col-span-4"
      now={{
        label: "This month",
        total: money(total),
        bar: {
          label: `Spent ${money(d.this_month)}, likely ${money(l.rest)} more${d.budget != null ? `, against a ${money(d.budget)} budget` : ""}`,
          max: scale,
          marker: d.budget ?? undefined,
          segments: [
            { value: d.this_month, role: "spending" },
            { value: l.rest ?? 0, role: "spending", likely: true },
          ],
        },
        text: (
          <>
            {money(d.this_month)} so far, likely {money(l.low)} to {money(l.high)} by the end of the month.
            {d.budget != null &&
              (total > d.budget
                ? ` That's about ${money(total - d.budget)} over the budget.`
                : ` That leaves about ${money(d.budget - total)} of the budget.`)}
          </>
        ),
      }}
      next={{
        label: monthYear(l.next_month),
        total: money(l.next),
        text: `Likely ${money(l.next_low)} to ${money(l.next_high)}. The next three months, about ${money(l.next_three)}.`,
      }}
      note={
        l.accuracy != null
          ? `Over the last four weeks this guess was ${Math.round(l.accuracy * 100)}% right for ${d.name}, so the range is as wide as it was off.`
          : undefined
      }
    />
  );
}

function Budget({ d }: { d: CategoryInsights }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(editable(d.budget));
  const save = useMutation({
    mutationFn: (budget: number | null) => apiSend("PUT", `categories/${d.id}`, { name: d.name, kind: d.kind, budget }),
    onSuccess: (_r, budget) => {
      refresh(qc);
      const was = d.budget;
      toast(budget == null ? `${d.name} has no budget now` : `${d.name}: ${money(budget)} a month`, () =>
        save.mutate(was),
      );
    },
  });
  const typed = text.trim() ? parseMoney(text) : null;
  const fits = d.suggested != null && d.suggested !== d.budget;
  return (
    <Card aria-labelledby="cat-budget">
      <CardHead
        id="cat-budget"
        title="Budget"
        right={d.budget != null ? <Pill tone="info">{money(d.budget)} a month</Pill> : <Pill>None yet</Pill>}
      />
      <p className="m-0 text-[14px] text-ink-2">
        {d.average_months === 0
          ? `Nothing's gone on ${d.name} in a whole month yet.`
          : d.budget == null
            ? `Without a budget, ${d.name} counts against the month's spending but has no line of its own. A usual month is ${money(d.average)}.`
            : d.over > 0
              ? `It went over in ${d.over} of the last ${d.average_months} months. A usual month is ${money(d.average)}.`
              : `It stayed under in each of the last ${d.average_months} months. A usual month is ${money(d.average)}.`}
      </p>
      {fits && (
        <Button
          primary={d.budget == null}
          className="self-start"
          disabled={save.isPending}
          onClick={() => save.mutate(d.suggested)}
        >
          {d.budget == null ? `Add a ${money(d.suggested)} budget` : `Change it to ${money(d.suggested)}`}
        </Button>
      )}
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed !== d.budget) save.mutate(typed);
        }}
      >
        <Input
          aria-label={`${d.name} budget a month`}
          inputMode="decimal"
          className="text-right"
          placeholder="Your own amount"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button disabled={save.isPending || typed === d.budget}>Save</Button>
      </form>
      {d.budget != null && (
        <button
          type="button"
          className="cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-ink-3 hover:text-ink-2"
          onClick={() => save.mutate(null)}
        >
          Take the budget away
        </button>
      )}
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
    </Card>
  );
}

function Merchants({ d }: { d: CategoryInsights }) {
  const total = d.merchants.reduce((s, m) => s + m.spent, 0) || 1;
  return (
    <Card aria-labelledby="cat-where">
      <CardHead
        id="cat-where"
        title="Where it goes"
        right={<span className="text-[13px] text-ink-3">{rangeName(d.range.months)}</span>}
      />
      <div className="flex flex-col">
        {d.merchants.slice(0, 8).map((m) => {
          const body = (
            <>
              <MerchantMark name={m.key || m.name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{m.name}</span>
                  <span className="mono flex-none">{money(m.spent)}</span>
                </span>
                <span className="mt-1 flex items-center gap-2 text-[12px] text-ink-3">
                  <span className="relative h-1.5 flex-1 rounded-full bg-raised">
                    <i
                      className="absolute inset-y-0 left-0 rounded-full bg-spending-fill"
                      style={{ width: `${(m.spent / total) * 100}%` }}
                    />
                  </span>
                  <span className="w-[86px] flex-none text-right">
                    {m.count} {m.count === 1 ? "time" : "times"}
                  </span>
                </span>
              </span>
            </>
          );
          const row =
            "flex items-center gap-3 border-t border-line py-2.5 text-[14px] text-ink no-underline first:border-t-0";
          return m.key ? (
            <Link key={m.key} to="/merchants/$key" params={{ key: m.key }} className={cn(row, "hover:bg-tile-2")}>
              {body}
            </Link>
          ) : (
            <div key="none" className={row}>
              {body}
            </div>
          );
        })}
        {!d.merchants.length && <div className="text-[14px] text-ink-3">Nothing over {rangeName(d.range.months)}.</div>}
      </div>
      {d.merchant_count > 8 && <div className="text-[13px] text-ink-3">And {d.merchant_count - 8} more places.</div>}
    </Card>
  );
}

function every(days: number): string {
  if (days === 7) return "every week";
  if (days === 14) return "every fortnight";
  if (days >= 28 && days <= 31) return "every month";
  return `every ${days} days`;
}

function Regulars({ d }: { d: CategoryInsights }) {
  const habits = d.likely.habits ?? [];
  if (!habits.length) return null;
  return (
    <Card aria-labelledby="cat-regular">
      <CardHead id="cat-regular" title="Regulars" />
      <p className="m-0 text-[14px] text-ink-2">
        Paid again and again at a steady gap, so they're counted in what's likely on their own days.
      </p>
      <div className="flex flex-col">
        {habits.slice(0, 6).map((h) => (
          <div
            key={h.key || h.name}
            className="flex items-center gap-3 border-t border-line py-2.5 text-[14px] first:border-t-0"
          >
            <MerchantMark name={h.key || h.name} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{h.name}</span>
              <span className="block text-[12px] text-ink-3">
                About {money(h.amount)} {every(h.every_days)}
                {h.next ? ` · next ${shortDate(h.next)}` : ""}
              </span>
            </span>
            <span className="mono text-right text-[13px] text-ink-2">
              {money(Math.round((h.amount * 365) / h.every_days / 12))}/mo
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
