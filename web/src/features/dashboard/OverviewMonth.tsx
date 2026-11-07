/**
 * The Overview's month, as on the uplift canvas: money left day by day (stat tiles, a striped bar for each day spent,
 * hatched for what's likely, the line of money left, pay and bills as icon chips under their days, and the chosen
 * day's tiles), safe to spend with "what if I spend…", what's coming up with how well Bills covers it, where the
 * money went, and recent activity. Every chart reads by dragging, hovering or the arrow keys.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Count } from "~/features/common/charts";
import { Bar, BigNumber, Card, CardHead, ChoiceChip, Eyebrow, Stat } from "~/features/common/ds";
import { dayDate, money, parseDate, shortDate } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { transactionsQuery } from "~/features/common/queries";
import type { Dashboard, SpendingMonth } from "~/features/common/types";
import { Pill, cn } from "~/features/common/ui";
import type { Month } from "~/features/dashboard/DashboardPage";

const EVENT_GLYPH: Record<string, { g: Glyph; tone: Tone }> = {
  pay: { g: I.pay, tone: "savings" },
  topup: { g: I.transfer, tone: "offset" },
  bill: { g: I.bills, tone: "bills" },
};

/** Money left, day by day. */
export function MonthCard({ m, sel, setSel }: { m: Month; sel: number | null; setSel: (i: number | null) => void }) {
  const s = m.s;
  const n = s.days;
  const day = sel ?? m.today;
  const top = Math.max(s.allowance, ...m.left, 1);
  const y = (v: number) => 4 + (1 - Math.max(v, 0) / top) * 92;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const past = [
    `M0 ${y(s.allowance).toFixed(2)}`,
    ...m.left.slice(0, m.today + 1).map((v, i) => `L${x(i).toFixed(2)} ${y(v).toFixed(2)}`),
  ].join(" ");
  const future = m.left
    .slice(m.today)
    .map((v, i) => `${i ? "L" : "M"}${x(m.today + i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
  const barTop = Math.max(s.even_per_day * 2.5, ...s.daily, 1);
  const likelyLeft = s.projected;
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSel(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setSel(Math.min(n - 1, Math.max(0, day + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const done = day < m.today;
  const isToday = day === m.today;
  const evs = m.events[day];
  return (
    <Card aria-labelledby="mo-h">
      <CardHead
        id="mo-h"
        title="Money left, day by day"
        right={
          <span className="text-[13px] text-ink-3">
            {shortDate(s.start)} – {shortDate(s.end)} · day {s.day} of {s.days}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Spent so far" value={money(s.spent)} note={`of ${money(s.allowance)}`} role="spending" />
        <Stat label="Left" value={money(s.left)} note={`${s.remaining} days to go`} role="accent" />
        <Stat
          label="Likely on the last day"
          value={money(likelyLeft)}
          note={likelyLeft >= 0 ? "spare, back to Offset" : "short"}
          role={likelyLeft >= 0 ? "savings" : "bills"}
          noteColor={likelyLeft >= 0 ? undefined : "var(--color-warn)"}
        />
        <Stat
          label="Vs even pace"
          value={money(Math.abs(s.vs_pace))}
          note={s.vs_pace <= 0 ? "under, adds to tomorrow" : "over, takes from tomorrow"}
          role={s.vs_pace <= 0 ? "savings" : "bills"}
        />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="The month day by day. Drag across it, or use the arrow keys, to move between days."
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={day + 1}
        aria-valuetext={`${dayDate(m.dates[day])}: ${money(m.left[day])} left`}
        onPointerDown={pick}
        onPointerMove={pick}
        onPointerLeave={(e) => e.pointerType === "mouse" && setSel(null)}
        onKeyDown={onKey}
        className="relative mt-1 cursor-ew-resize touch-pan-y rounded-xl outline-offset-4 select-none"
      >
        <div className="relative h-[200px] sm:h-[230px]">
          {/* What's ahead is likely, not known: hatched. */}
          <div
            aria-hidden
            className="hatched absolute top-0 right-0 bottom-0 rounded-xl border-l border-dashed opacity-40"
            style={{
              left: `${((m.today + 1) / n) * 100}%`,
              borderColor: "color-mix(in srgb, var(--color-accent-fill) 50%, transparent)",
            }}
          />
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-[45%] items-end gap-[3px]">
            {s.daily.map((v, i) => {
              const past = i < m.today;
              const val = i <= m.today ? v : s.safe_per_day;
              return (
                <div key={i} className={cn("flex h-full flex-1 items-end rounded-[5px]", i === day && "bg-ink/6")}>
                  <i
                    className={cn("block w-full rounded-t-[4px]", past ? "striped" : i === m.today ? "" : "hatched")}
                    style={{
                      height: `max(3px, ${Math.min(val / barTop, 1) * 100}%)`,
                      ["--c" as string]: "var(--color-spending-fill)",
                      // Only set what applies: an empty background shorthand would wipe the colour.
                      ...(past
                        ? { backgroundColor: "var(--color-spending-fill)" }
                        : i === m.today
                          ? { background: "var(--grad)" }
                          : {
                              boxShadow:
                                "inset 0 0 0 1px color-mix(in srgb, var(--color-spending-fill) 45%, transparent)",
                            }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <path
              d={past}
              fill="none"
              stroke="var(--color-teal)"
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
            {m.today < n - 1 && (
              <path
                d={future}
                fill="none"
                stroke="var(--color-teal)"
                strokeWidth={2.2}
                strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-3/60"
            style={{ left: `${x(day)}%` }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_var(--color-accent-fill)]"
            style={{ left: `${x(day)}%`, top: `${y(m.left[day])}%` }}
          />
          <span className="num absolute top-0 left-1 text-[10px] text-ink-3">{money(top)}</span>
        </div>
        <div aria-hidden className="mt-2 flex h-6 gap-[3px]">
          {m.events.map((e, i) => {
            const first = e[0];
            return (
              <div key={i} className="flex flex-1 justify-center">
                {first && (
                  <>
                    {/* Icon chips where there's room; on a phone a day is too narrow, so a dot in the same colour. */}
                    <Chip
                      g={EVENT_GLYPH[first.kind].g}
                      tone={EVENT_GLYPH[first.kind].tone}
                      size="sm"
                      solid={i === day}
                      className="max-md:hidden"
                    />
                    <span
                      className="mt-1.5 size-2 rounded-full md:hidden"
                      style={{
                        background:
                          first.kind === "bill"
                            ? "var(--color-bills-fill)"
                            : first.kind === "pay"
                              ? "var(--color-savings-fill)"
                              : "var(--color-offset-fill)",
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div aria-hidden className="mono mt-1 flex gap-[3px] text-[10px] text-ink-3">
          {m.dates.map((date, i) => (
            <span
              key={date}
              className={cn("flex-1 text-center whitespace-nowrap", i === m.today && "font-semibold text-teal")}
            >
              {i === m.today ? "today" : i % 5 === 0 ? parseDate(date).getDate() : ""}
            </span>
          ))}
        </div>
      </div>
      <p className="m-0 flex items-center gap-1.5 text-[12px] text-ink-3">
        Drag across the chart to see any day. Striped is spent, hatched is likely.
      </p>
      <div aria-live="polite" className="grid gap-2.5 sm:grid-cols-[1.3fr_1fr_1fr]">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 p-3.5">
          {evs[0] ? (
            <Chip g={EVENT_GLYPH[evs[0].kind].g} tone={EVENT_GLYPH[evs[0].kind].tone} size="lg" />
          ) : (
            <Chip g={I.spending} tone="spending" size="lg" />
          )}
          <span className="min-w-0">
            <span className="block font-semibold">
              {isToday ? "Today, " : ""}
              {dayDate(m.dates[day])}
            </span>
            <span className="block truncate text-[13px] text-ink-3">
              {evs.length
                ? evs
                    .map(
                      (e) => `${e.name}${e.amount != null ? ` ${e.kind === "pay" ? "+" : ""}${money(e.amount)}` : ""}`,
                    )
                    .join(", ")
                : "No pay or bills this day"}
            </span>
          </span>
        </div>
        <Stat
          label={done ? "Spent" : isToday ? "Spent today" : "Safe to spend"}
          value={money(done || isToday ? s.daily[day] : s.safe_per_day, { cents: true })}
          role="spending"
        />
        <Stat label="Left after" value={money(m.left[day], { cents: true })} role="accent" />
      </div>
    </Card>
  );
}

/** Safe to spend, with "what if I spend…". */
export function SafeCard({ s }: { s: SpendingMonth }) {
  const [amt, setAmt] = useState<number | null>(null);
  const likely = Math.max(0, s.left - s.projected);
  const after = amt != null && s.remaining ? (s.left - amt) / s.remaining : null;
  return (
    <Card lit tint="accent" aria-labelledby="safe-h" className="md:col-span-4">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow id="safe-h">Safe to spend</Eyebrow>
        <Pill tone={s.vs_pace <= 0 ? "good" : "warn"}>
          {money(Math.abs(s.vs_pace))} {s.vs_pace <= 0 ? "under" : "over"} pace
        </Pill>
      </div>
      <div className="flex items-baseline gap-2">
        <BigNumber>
          <Count k="dash:safe" value={s.safe_per_day} format={(v) => money(v, { cents: true })} />
        </BigNumber>
        <span className="text-[15px] text-ink-3">a day</span>
      </div>
      <div className="-mt-1 text-[13px] text-ink-3">
        {s.remaining ? `for ${s.remaining} days, from ${money(s.left)} left` : "The last day: whatever's left is yours"}
      </div>
      <Bar
        label={`Spent ${money(s.spent)}, likely ${money(likely)} more, of ${money(s.allowance)}`}
        max={Math.max(s.allowance, s.spent + likely, 1)}
        segments={[
          { value: s.spent, role: "spending" },
          { value: likely, role: "spending", likely: true },
        ]}
      />
      <div className="mt-1">
        <div className="text-[13px] font-semibold">What if I spend…</div>
        <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1">
          {[50, 100, 250, 500].map((v) => (
            <ChoiceChip key={v} pressed={amt === v * 100} onClick={() => setAmt(amt === v * 100 ? null : v * 100)}>
              ${v}
            </ChoiceChip>
          ))}
        </div>
        {after != null && amt != null && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Stat
              label="Then a day"
              value={money(after, { cents: true })}
              note={`−${money(s.safe_per_day - after, { cents: true })}`}
              noteColor="var(--color-warn)"
            />
            <Stat
              label="Likely last day"
              value={money(s.projected - amt)}
              note={s.projected - amt >= 0 ? "still spare" : "short"}
              role={s.projected - amt >= 0 ? "savings" : "bills"}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Pay and bills still to come this month, and how well the Bills account covers the ones before pay. */
export function ComingUp({ d, m }: { d: Dashboard; m: Month }) {
  const navigate = useNavigate();
  const rows = m.events.flatMap((evs, i) => (i > m.today ? evs.map((e) => ({ ...e, i })) : []));
  const b = m.beforePay;
  const held = d.bills?.balance ?? null;
  const by = m.nextPay != null ? dayDate(m.dates[m.nextPay]) : "the next fortnight";
  return (
    <Card aria-labelledby="up-h" className="md:col-span-6">
      <CardHead
        id="up-h"
        title="Coming up"
        right={
          <Link to="/bills" className="text-[14px] font-semibold text-teal no-underline">
            All bills
          </Link>
        }
      />
      <div className="rounded-2xl border border-line bg-tile-2 p-3.5">
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
      <div className="-mx-1 flex flex-col">
        {rows.map((r, k) => {
          const e = EVENT_GLYPH[r.kind];
          return (
            <button
              key={k}
              type="button"
              onClick={() => navigate({ to: r.kind === "bill" ? "/bills" : "/rules" })}
              className="chip-host press flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2"
            >
              <Chip g={e.g} tone={e.tone} size="lg" />
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
    </Card>
  );
}

const CAT_COLOURS = [
  "var(--color-spending-fill)",
  "var(--color-offset-fill)",
  "var(--color-bills-fill)",
  "var(--color-savings-fill)",
  "var(--color-invest)",
  "var(--color-accent-fill)",
  "var(--color-rose)",
];

/** Where the money went: a donut and a bar per category against its budget. */
export function WhereItWent({ s }: { s: SpendingMonth }) {
  const [hover, setHover] = useState<number | null>(null);
  const cats = [
    ...s.categories
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((c, i) => ({ ...c, colour: CAT_COLOURS[i % CAT_COLOURS.length] })),
    ...(s.unsorted > 0
      ? [{ id: -1, name: "Not sorted yet", budget: null, spent: s.unsorted, colour: "var(--color-out)" }]
      : []),
  ];
  const total = cats.reduce((a, c) => a + c.spent, 0) || 1;
  let at = 0;
  const shown = hover != null ? cats[hover] : null;
  return (
    <Card aria-labelledby="wiw-h" className="md:col-span-6">
      <CardHead
        id="wiw-h"
        title="Where it went"
        right={
          s.unsorted > 0 ? (
            <Link to="/sort" className="text-[14px] font-semibold text-teal no-underline">
              Sort {money(s.unsorted)}
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative size-[150px] flex-none">
          <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden>
            {cats.map((c, i) => {
              const len = (c.spent / total) * 100;
              const el = (
                <circle
                  key={c.id}
                  cx="21"
                  cy="21"
                  r="15.9"
                  fill="none"
                  stroke={c.colour}
                  strokeWidth={hover === i ? 6.5 : 5}
                  pathLength={100}
                  strokeDasharray={`${Math.max(len - 1, 0.5)} ${100 - Math.max(len - 1, 0.5)}`}
                  strokeDashoffset={-at}
                  className="transition-[stroke-width] duration-150"
                />
              );
              at += len;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="num text-[17px]">{money(shown ? shown.spent : s.spent)}</span>
            <span className="max-w-[90px] truncate text-[11px] text-ink-3">{shown ? shown.name : "this month"}</span>
          </div>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col" onMouseLeave={() => setHover(null)}>
          {cats.map((c, i) => (
            <Link
              key={c.id}
              to={c.id === -1 ? "/sort" : "/spending"}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="press flex min-h-12 flex-col justify-center gap-1.5 rounded-xl px-1.5 text-ink no-underline hover:bg-tile-2"
            >
              <span className="flex items-center gap-2 text-[14px]">
                <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: c.colour }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="num text-[13px] text-ink-2">
                  {money(c.spent)}
                  {c.budget ? ` / ${money(c.budget)}` : ""}
                </span>
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-raised">
                <span
                  className="striped block h-full rounded-full"
                  style={{
                    width: `${c.budget ? Math.min(c.spent / c.budget, 1) * 100 : (c.spent / cats[0].spent) * 100}%`,
                    backgroundColor: c.colour,
                  }}
                />
              </span>
            </Link>
          ))}
          {!cats.length && <span className="text-[13px] text-ink-3">Nothing spent yet this month.</span>}
        </div>
      </div>
    </Card>
  );
}

const HOW: Record<string, [string, "teal" | "info" | "good" | "warn" | "mute"]> = {
  manual: ["Entered", "teal"],
  cash: ["Cash", "teal"],
  statement: ["Imported", "info"],
  adjustment: ["Adjustment", "warn"],
};

/** The latest few transactions across the household, newest first. */
export function RecentActivity() {
  const q = useQuery(transactionsQuery({ limit: 6 }));
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
        {(q.data ?? []).map((t) => {
          const [how, tone] = t.merged ? (["Matched", "good"] as const) : (HOW[t.kind] ?? ["", "mute"]);
          return (
            <Link
              key={t.id}
              to="/transactions"
              className="chip-host press flex min-h-16 items-center gap-3 rounded-2xl px-1.5 text-ink no-underline hover:bg-tile-2"
            >
              <Chip
                g={t.amount > 0 ? I.pay : I.spending}
                tone={t.amount > 0 ? "savings" : "spending"}
                size="lg"
                round
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.merchant || t.description}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {shortDate(t.date)}
                  {t.category ? ` · ${t.category}` : " · Not sorted"}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className={cn("num", t.amount > 0 && "text-good")}>
                  {money(t.amount, { cents: true, sign: true })}
                </span>
                {how && <Pill tone={tone}>{how}</Pill>}
              </span>
            </Link>
          );
        })}
        {q.data && !q.data.length && <span className="px-1.5 py-2 text-[13px] text-ink-3">No transactions yet.</span>}
      </div>
    </Card>
  );
}
