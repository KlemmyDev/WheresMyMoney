/**
 * One category, looked at closely: what's gone on it over a timeframe (this month, or the last 3, 6 or 12 months) and
 * how that compares with the stretch before; month by month against its budget, with this month's likely finish
 * hatched; what's likely next month; its budget (set, change or take away, with what would fit); where it goes (its
 * merchants), its regular payments, which days of the week it goes on, and its transactions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { short } from "~/features/common/charts";
import { Bar, Card, CardHead, Details, Stat } from "~/features/common/ds";
import { dayDate, editable, longDate, money, monthYear, parseMoney, shortDate } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { categoryInsightsQuery, refresh } from "~/features/common/queries";
import type { CategoryInsights } from "~/features/common/types";
import { Button, Empty, ErrorText, Input, Pill, Segmented, cn } from "~/features/common/ui";
import { CategoryGlyph, MerchantMark } from "~/features/spending/MerchantIcon";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

const FIRST = 12;
const RANGES = [
  { value: "1", label: "Month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "Year" },
] as const;
type Range = (typeof RANGES)[number]["value"];
const RANGE_KEY = "wmm:category-range";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function savedRange(): Range {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    return RANGES.some((r) => r.value === v) ? (v as Range) : "3";
  } catch {
    return "3";
  }
}

export function CategoryPage({ categoryId }: { categoryId: number }) {
  const [range, setRange] = useState<Range>(savedRange);
  const q = useQuery(categoryInsightsQuery(categoryId, Number(range)));
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const name = q.data?.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);
  const pick = (r: Range) => {
    setRange(r);
    setAll(false);
    try {
      localStorage.setItem(RANGE_KEY, r);
    } catch {
      /* remembered only while the page is open */
    }
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
      <div className="flex flex-col gap-3">
        <Link to="/spending" className="self-start text-[14px] font-semibold text-teal no-underline">
          ← Spending
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <CategoryGlyph name={d.name} kind={d.kind} size="xl" />
            <div className="min-w-0">
              <h1 className="m-0 truncate text-[28px] font-semibold tracking-tight">{d.name}</h1>
              <div className="text-[14px] text-ink-3">
                {d.kind === "bills" ? "A bills category" : "A spending category"}
                {d.budget != null ? ` · ${money(d.budget)} a month budget` : " · no budget"}
              </div>
            </div>
          </div>
          <Segmented label="Timeframe" options={[...RANGES]} value={range} onChange={pick} />
        </div>
      </div>

      <Hero d={d} />

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card className="md:col-span-8" aria-labelledby="cat-months">
          <CardHead
            id="cat-months"
            title="Month by month"
            right={
              <span className="flex flex-wrap gap-3.5 text-[13px] font-medium text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <i className="size-2 rounded-sm bg-spending" />
                  Spent
                </span>
                {d.likely.ready && (
                  <span className="inline-flex items-center gap-1.5">
                    <i className="hatched size-2.5 rounded-sm" style={{ ["--c" as string]: "var(--color-spending)" }} />
                    Likely
                  </span>
                )}
                {d.budget != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                    Budget
                  </span>
                )}
              </span>
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
        <Weekdays d={d} />
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

function rangeName(months: number): string {
  return months === 1 ? "this month" : `the last ${months} months`;
}

/** The timeframe in a sentence, and how it compares with the stretch before it. */
function Hero({ d }: { d: CategoryInsights }) {
  const r = d.range;
  const change = r.previous != null && r.previous > 0 ? (r.spent - r.previous) / r.previous : null;
  const before = r.months === 1 ? "the same days last month" : `the ${r.months} months before`;
  const perMonth = r.months > 1 ? Math.round(r.spent / r.months) : null;
  return (
    <Card lit tint={d.kind === "bills" ? "bills" : "spending"} aria-label={`${d.name} in a sentence`}>
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
      <Details label="See the numbers">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="This month" value={money(d.this_month)} note={`day ${d.day} of ${d.days}`} role="spending" />
          <Stat
            label="Usual month"
            value={money(d.average)}
            note={d.average_months ? `last ${d.average_months} months` : "not enough yet"}
            role="spending"
          />
          <Stat label="Most in a month" value={money(d.highest)} note="of those" role="spending" />
          <Stat
            label="Last 12 months"
            value={money(d.year)}
            note={d.first ? `since ${monthYear(d.first.slice(0, 7))}` : "nothing yet"}
            role="spending"
          />
        </div>
      </Details>
    </Card>
  );
}

function ticks(hi: number): number[] {
  const raw = hi / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 3 >= hi) ?? mag * 10;
  return [0, step, step * 2, step * 3];
}

/** Bars for each month, this month's likely rest hatched on top, the budget as a dashed line; the timeframe is lit. */
function MonthChart({ d }: { d: CategoryInsights }) {
  const n = d.months.length;
  const [picked, setPicked] = useState<number | null>(null);
  const at = picked ?? n - 1;
  const rest = d.likely.ready ? (d.likely.rest ?? 0) : 0;
  const hi = Math.max(1, d.budget ?? 0, ...d.months.map((m, i) => m.spent + (i === n - 1 ? rest : 0)));
  const t = ticks(hi);
  const top = t[t.length - 1];
  const inRange = (m: string) => m >= d.range.start.slice(0, 7);
  const m = d.months[at];
  const isNow = at === n - 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-6 text-[14px] text-ink-2" aria-live="polite">
        {m && (
          <>
            <b className="text-ink">{monthYear(m.month)}</b>: {money(m.spent)}
            {isNow ? " so far" : ""}
            {isNow && rest > 0 ? `, likely about ${money(m.spent + rest)} by the end` : ""}
            {d.budget != null && !isNow
              ? m.spent > d.budget
                ? `, ${money(m.spent - d.budget)} over the budget`
                : `, ${money(d.budget - m.spent)} under the budget`
              : ""}
            .
          </>
        )}
      </div>
      <div className="flex gap-2.5">
        <div className="mono flex h-[200px] flex-col justify-between text-right text-xs text-ink-3">
          {[...t].reverse().map((v) => (
            <span key={v}>${short(v)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="relative flex h-[200px] items-end gap-1 border-b border-line"
            role="group"
            aria-label={`What went on ${d.name} each month, oldest first`}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const next = Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
                setPicked(next);
                (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
              }
            }}
          >
            {d.months.map((mo, i) => {
              const likely = i === n - 1 ? rest : 0;
              const lit = inRange(mo.month);
              return (
                <button
                  key={mo.month}
                  type="button"
                  tabIndex={i === at ? 0 : -1}
                  aria-label={`${monthYear(mo.month)}: ${money(mo.spent)}`}
                  aria-pressed={i === at}
                  onClick={() => setPicked(i)}
                  onMouseEnter={() => setPicked(i)}
                  className="relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end border-0 bg-transparent p-0"
                >
                  {likely > 0 && (
                    <span
                      className="hatched block w-full rounded-t-[4px]"
                      style={{ height: `${(likely / top) * 100}%`, ["--c" as string]: "var(--color-spending)" }}
                    />
                  )}
                  <span
                    className={cn(
                      "striped block w-full grow bg-spending-fill transition-opacity",
                      likely > 0 ? "" : "rounded-t-[4px]",
                      !lit && "opacity-35",
                      lit && i !== at && "opacity-75",
                    )}
                    style={
                      {
                        height: `max(2px, ${(mo.spent / top) * 100}%)`,
                        flexGrow: 0,
                        "--i": i,
                      } as CSSProperties
                    }
                  />
                </button>
              );
            })}
            {d.budget != null && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink"
                style={{ bottom: `${(d.budget / top) * 100}%` }}
              />
            )}
          </div>
          <div className="mono mt-1.5 flex justify-between text-xs text-ink-3">
            <span>{monthYear(d.months[0].month)}</span>
            <span>{monthYear(d.months[n - 1].month)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where this month is likely to finish, and next month. */
function Likely({ d }: { d: CategoryInsights }) {
  const l = d.likely;
  if (!l.ready)
    return (
      <Card className="md:col-span-4" aria-labelledby="cat-likely">
        <CardHead id="cat-likely" title="What's likely" />
        <p className="m-0 text-[14px] text-ink-2">
          {l.history_days > 0
            ? `After ${l.needs_days - l.history_days} more days of ${d.name} we can say what's likely to go on it.`
            : `Nothing's gone on ${d.name} yet, so there's nothing to learn from.`}
        </p>
      </Card>
    );
  const total = l.month_total ?? d.this_month;
  const scale = Math.max(total, l.high ?? 0, d.budget ?? 0, 1);
  return (
    <Card className="md:col-span-4" tint="accent" aria-labelledby="cat-likely">
      <CardHead id="cat-likely" title="What's likely" />
      <div className="flex flex-col gap-2">
        <div className="text-[13px] text-ink-3">This month</div>
        <div className="mono text-[26px] font-semibold">{money(total)}</div>
        <Bar
          label={`Spent ${money(d.this_month)}, likely ${money(l.rest)} more${d.budget != null ? `, against a ${money(d.budget)} budget` : ""}`}
          max={scale}
          height={12}
          marker={d.budget ?? undefined}
          segments={[
            { value: d.this_month, role: "spending" },
            { value: l.rest ?? 0, role: "spending", likely: true },
          ]}
        />
        <div className="text-[13px] text-ink-2">
          {money(d.this_month)} so far, likely {money(l.low)} to {money(l.high)} by the end of the month.
          {d.budget != null &&
            (total > d.budget
              ? ` That's about ${money(total - d.budget)} over the budget.`
              : ` That leaves about ${money(d.budget - total)} of the budget.`)}
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <div className="text-[13px] text-ink-3">{monthYear(l.next_month)}</div>
        <div className="mono text-[22px] font-semibold">{money(l.next)}</div>
        <div className="text-[13px] text-ink-2">
          Likely {money(l.next_low)} to {money(l.next_high)}. The next three months, about {money(l.next_three)}.
        </div>
      </div>
      {l.accuracy != null && (
        <div className="text-[12px] text-ink-3">
          Over the last four weeks this guess was {Math.round(l.accuracy * 100)}% right for {d.name}, so the range is as
          wide as it was off.
        </div>
      )}
    </Card>
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

function Weekdays({ d }: { d: CategoryInsights }) {
  const total = d.weekdays.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const hi = Math.max(...d.weekdays, 1);
  const top = d.weekdays.indexOf(hi);
  return (
    <Card aria-labelledby="cat-week">
      <CardHead
        id="cat-week"
        title="Days of the week"
        right={<span className="text-[13px] text-ink-3">{rangeName(d.range.months)}</span>}
      />
      <p className="m-0 text-[14px] text-ink-2">
        Most goes on <b className="text-ink">{WEEKDAY_NAMES[top]}</b>, {Math.round((hi / total) * 100)}% of it.
      </p>
      <div className="flex h-[120px] items-end gap-2" role="img" aria-label="Spent on each day of the week">
        {d.weekdays.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="mono text-[11px] text-ink-3">{v ? `$${short(v)}` : ""}</span>
            <span
              className={cn("striped w-full grow rounded-t-[4px] bg-spending-fill", i !== top && "opacity-55")}
              style={{ height: `max(2px, ${(v / hi) * 70}%)`, flexGrow: 0, ["--i" as string]: i } as CSSProperties}
            />
            <span className={cn("text-[12px]", i === top ? "font-semibold text-ink" : "text-ink-3")}>
              {WEEKDAYS[i]}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
