/**
 * The loan's rate and the interest it costs, as pictures.
 *
 * - RateChanged: a new rate a statement showed. The step from the old rate to the new one, the rate over time, and
 *   what it does to a month (interest, the repayment and what comes off the loan), before and after.
 * - InterestCharged: what the bank actually charged each month for a year, with the rate in force under each bar so
 *   it's plain why the bars move, the month still to come drawn at what it's likely to be, and today's rate as a line.
 *
 * Rates are in basis points (629 = 6.29%) and money in cents. "What a month costs" is worked out on what's owed less
 * what sits in the offsetting accounts, the same as the cards above; an estimate, not the bank's figure.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { short } from "~/features/common/charts";
import { ticks } from "~/features/common/entity";
import { longDate, money, monthYear, parseDate, todayIso } from "~/features/common/format";
import type { LoanView } from "~/features/common/queries";
import { Button, Pill, Tile, TileTitle, cn } from "~/features/common/ui";

type Change = LoanView["changes"][number];
type Step = { date: string; bp: number };

const BAD = "var(--color-bad)";
const pc = (bp: number) => `${(bp / 100).toFixed(2)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The loan's rate over time, oldest first: each step is the rate from its date. The first is the rate before any
 *  change we know of (dated "" so it covers everything earlier). */
export function rateSteps(changes: Change[], nowBp: number | null): Step[] {
  const rates = changes
    .filter((c) => c.field === "rate" || c.field === "refinance")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!rates.length) return [{ date: "", bp: nowBp ?? 0 }];
  const steps: Step[] = [{ date: "", bp: rates[0].was ?? rates[0].value }];
  for (const c of rates) if (c.value !== steps.at(-1)!.bp) steps.push({ date: c.date, bp: c.value });
  return steps;
}

export function rateOn(steps: Step[], iso: string): number {
  let bp = steps[0].bp;
  for (const s of steps) if (s.date <= iso) bp = s.bp;
  return bp;
}

/** Interest a month on what's owed less the offset, at a rate. */
function monthly(v: LoanView, bp: number): number {
  return (Math.max(v.loan.balance - Math.max(v.offsetting, 0), 0) * bp) / 10000 / 12;
}

/* ------------------------------------------------------------------------------------------------------------------ */

/** A new rate an imported statement showed: the step, the rate over time and what a month looks like either side. */
export function RateChanged({
  v,
  spotted,
  onDismiss,
  onCheck,
}: {
  v: LoanView;
  spotted: { date: string; value: number; was: number | null };
  onDismiss: () => void;
  onCheck: () => void;
}) {
  const lo = v.loan;
  const was = spotted.was ?? lo.rate_bp ?? spotted.value;
  const up = spotted.value > was;
  const delta = Math.abs(spotted.value - was) / 100;
  // A repayment change on the same statement goes with it; otherwise the repayment stays as it is.
  const payChange = v.changes.find((c) => c.field === "repayment" && c.date === spotted.date);
  const payWas = payChange?.was ?? lo.repayment ?? 0;
  const payNow = payChange?.value ?? lo.repayment ?? 0;
  const intWas = monthly(v, was);
  const intNow = monthly(v, spotted.value);
  const tint = up ? BAD : "var(--color-good)";
  return (
    <Tile
      i={0}
      role="status"
      aria-labelledby="ln-rate"
      className="lit"
      style={{
        borderColor: `color-mix(in srgb, ${tint} 30%, var(--color-line))`,
        background: `radial-gradient(520px 260px at 0% 0%, color-mix(in srgb, ${tint} 13%, transparent), transparent 70%), var(--color-tile)`,
      }}
    >
      <TileTitle
        id="ln-rate"
        right={
          <Pill tone={up ? "bad" : "good"}>
            {up ? "Up" : "Down"} {delta.toFixed(2)} points
          </Pill>
        }
      >
        The rate changed
      </TileTitle>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="mono text-[22px] font-semibold tracking-[-0.03em] text-ink-3 line-through decoration-1">
              {pc(was)}
            </span>
            <span aria-hidden className="text-[20px] text-ink-3">
              →
            </span>
            <span className="mono text-[40px] leading-[46px] font-semibold tracking-[-0.045em] sm:text-[46px] sm:leading-[52px]">
              {pc(spotted.value)}
            </span>
          </div>
          <p className="m-0 -mt-1 text-[13px] text-ink-3">
            From {longDate(spotted.date)}, spotted in a statement from {monthYear(spotted.date.slice(0, 7))}. The loan
            here still works at {pc(lo.rate_bp ?? was)} until you check it.
          </p>
          <div className="grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Shift label="Interest" was={intWas} now={intNow} worse="more" />
            <Shift label="Repayment" was={payWas} now={payNow} worse="more" />
            <Shift
              label="Off the loan"
              was={Math.max(payWas - intWas, 0)}
              now={Math.max(payNow - intNow, 0)}
              worse="less"
            />
          </div>
        </div>
        <RateHistory steps={rateSteps(v.changes, lo.rate_bp)} />
      </div>
      <div className="flex w-full gap-2 sm:justify-end [&>*]:grow sm:[&>*]:grow-0">
        <Button onClick={onDismiss}>Dismiss</Button>
        <Button primary onClick={onCheck}>
          Check what changes
        </Button>
      </div>
    </Tile>
  );
}

/** A month's figure before and after: the new value, what it was, and the difference coloured by whether it's worse. */
function Shift({ label, was, now, worse }: { label: string; was: number; now: number; worse: "more" | "less" }) {
  const d = now - was;
  const bad = worse === "more" ? d > 0 : d < 0;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-[12.5px] text-ink-3">{label}</span>
      <span className="mono text-[17px] font-semibold text-ink">{money(now)}</span>
      {/* On a phone the difference gets the line to itself; what it was joins it from tablet up. */}
      <span className="mono flex flex-wrap gap-x-1.5 text-[12px] text-ink-3">
        {Math.abs(d) < 100 ? (
          "no change"
        ) : (
          <>
            <b className={bad ? "text-bad" : "text-good"}>{money(d, { sign: true })}</b>
            <span className="max-sm:hidden">from {money(was)}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** The rate over time as steps, from a few months before the first change we know of to today. Hover to read it. */
function RateHistory({ steps }: { steps: Step[] }) {
  const today = todayIso();
  const firstDated = steps.find((s) => s.date)?.date ?? today;
  const back = parseDate(firstDated);
  back.setMonth(back.getMonth() - 3);
  const yearAgo = parseDate(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const start = back < yearAgo ? back : yearAgo;
  const t0 = start.getTime();
  const span = parseDate(today).getTime() - t0 || 1;
  const x = (iso: string) => (iso ? Math.min(1, Math.max(0, (parseDate(iso).getTime() - t0) / span)) : 0);
  const bps = steps.map((s) => s.bp);
  const lo = Math.min(...bps) - 15;
  const hi = Math.max(...bps) + 15;
  const H = 96;
  const y = (bp: number) => 18 + (1 - (bp - lo) / (hi - lo || 1)) * (H - 30);
  const W = 1000;
  let d = "";
  steps.forEach((s, i) => {
    const sx = x(s.date) * W;
    d += i ? `H${sx.toFixed(1)}V${y(s.bp).toFixed(1)}` : `M0 ${y(s.bp).toFixed(1)}`;
  });
  d += `H${W}`;
  const [at, setAt] = useState<number | null>(null);
  const shown = at ?? steps.length - 1;
  const s = steps[shown];
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="min-h-5 text-[13px] text-ink-3" aria-live="polite">
        <b className="mono text-ink">{pc(s.bp)}</b>{" "}
        {s.date ? `from ${longDate(s.date)}` : `before ${longDate(steps[1]?.date ?? today)}`}
        {shown === steps.length - 1 ? ", now" : ""}
      </div>
      <div
        className="relative w-full"
        style={{ height: H }}
        role="img"
        aria-label={`The rate over time: ${steps.map((st) => pc(st.bp)).join(", then ")}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left) / r.width;
          let i = 0;
          steps.forEach((st, k) => {
            if (x(st.date) <= f) i = k;
          });
          setAt(i);
        }}
        onPointerLeave={() => setAt(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <path d={`${d}V${H}H0Z`} fill={`color-mix(in srgb, ${BAD} 12%, transparent)`} className="fill-after" />
          <path
            d={d}
            fill="none"
            stroke={BAD}
            strokeWidth="2.25"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="wipe"
          />
        </svg>
        {steps.map((st, i) => {
          const left = x(st.date);
          const next = steps[i + 1] ? x(steps[i + 1].date) : 1;
          return (
            <span
              key={st.date || "start"}
              aria-hidden
              className={cn("pointer-events-none absolute transition-opacity", at != null && at !== i && "opacity-40")}
              style={{
                left: `clamp(22px, ${((left + next) / 2) * 100}%, calc(100% - 22px))`,
                top: y(st.bp) - 22,
                transform: "translateX(-50%)",
              }}
            >
              <span className="mono text-[11px] font-semibold whitespace-nowrap text-ink-2">{pc(st.bp)}</span>
            </span>
          );
        })}
        {steps.slice(1).map((st, i) => (
          <i
            key={st.date}
            aria-hidden
            className={cn(
              "pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-tile",
              at === i + 1 && "scale-125",
            )}
            style={{ left: `${x(st.date) * 100}%`, top: y(st.bp), borderColor: BAD }}
          />
        ))}
      </div>
      <div className="mono flex justify-between text-[11px] text-ink-3">
        <span>{monthYear(startIso)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The interest the bank actually charged, a bar a month for a year, from the loan's statements: a cost of the loan,
 * not money coming in. Under the bars, the rate in force; the month still to come, dashed at what it's likely to be.
 */
export function InterestCharged({ v, c }: { v: LoanView; c: NonNullable<LoanView["interest_charged"]> }) {
  const steps = rateSteps(v.changes, v.loan.rate_bp);
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const nowBp = rateOn(steps, today);
  // At the rate the statements show now (which may be newer than the loan's own until it's checked).
  const likely = v.loan.rate_bp ? (v.charged_per_month * nowBp) / v.loan.rate_bp : v.charged_per_month;
  const rows = c.months.map((m) => {
    const value = Math.max(m.amount, 0);
    return { ...m, value, bp: rateOn(steps, `${m.month}-15`), toCome: m.month === thisMonth && value === 0 };
  });
  const n = rows.length;
  const charged = rows.filter((r) => r.value > 0);
  const lastIdx = rows.findLastIndex((r) => r.value > 0);
  const [picked, setPicked] = useState<number | null>(null);
  const at = picked ?? (lastIdx >= 0 ? lastIdx : n - 1);
  const r = rows[at];
  const t = ticks(Math.max(1, likely, ...rows.map((x) => x.value)));
  const top = t.at(-1)!;
  const H = 150;
  const high = charged.reduce<(typeof rows)[number] | null>((a, b) => (!a || b.value > a.value ? b : a), null);
  // The rate strip: runs of months at the same rate.
  const runs: { bp: number; from: number; n: number }[] = [];
  rows.forEach((row, i) => {
    const last = runs.at(-1);
    if (last && last.bp === row.bp) last.n++;
    else runs.push({ bp: row.bp, from: i, n: 1 });
  });
  const bps = runs.map((x) => x.bp);
  const minBp = Math.min(...bps);
  const maxBp = Math.max(...bps);
  const heat = (bp: number) => 18 + ((bp - minBp) / (maxBp - minBp || 1)) * 34;
  const say = (row: (typeof rows)[number]): ReactNode =>
    row.toCome ? (
      <>
        <b className="text-ink">{monthYear(row.month)}</b>: not charged yet, likely about{" "}
        <b className="text-ink">{money(likely)}</b> at {pc(row.bp)}.
      </>
    ) : (
      <>
        <b className="text-ink">{monthYear(row.month)}</b>:{" "}
        <b className="text-ink">{money(row.value, { cents: true })}</b> charged at {pc(row.bp)}
        {row.value > likely * 1.05
          ? `, ${money(row.value - likely)} more than today's rate gives`
          : row.value < likely * 0.95
            ? `, ${money(likely - row.value)} less than today's rate gives`
            : ", about what today's rate gives"}
        .
      </>
    );
  return (
    <Tile i={2} aria-labelledby="ln-int">
      <TileTitle id="ln-int" right={<span className="mono text-ink-3">last 12 months</span>}>
        Interest charged
      </TileTitle>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">{money(c.year)}</div>
          <div className="text-[13px] text-ink-3">charged by the bank over the past year, added to what we owe</div>
        </div>
        <div className="grid grid-cols-3 gap-5 text-[12.5px]">
          <Stat label="Average month" value={money(c.per_month)} />
          <Stat
            label={high ? `Most, ${MONTHS[Number(high.month.slice(5)) - 1]}` : "Most"}
            value={high ? money(high.value) : "—"}
          />
          <Stat label={`Next, at ${pc(nowBp)}`} value={`~${money(likely)}`} dashed />
        </div>
      </div>
      {charged.length === 0 ? (
        <p className="m-0 text-[15px] text-ink-2">
          The loan statements imported so far don&apos;t show any interest charged.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="min-h-6 text-[14px] text-ink-2" aria-live="polite">
            {say(r)}
          </div>
          <div className="flex gap-2.5">
            <div className="mono flex flex-col justify-between text-right text-xs text-ink-3" style={{ height: H }}>
              {[...t].reverse().map((tv) => (
                <span key={tv}>${short(tv)}</span>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <div
                className="relative flex items-end gap-1 border-b border-line"
                style={{ height: H }}
                role="group"
                aria-label="Interest charged each month, oldest first"
                onPointerLeave={() => setPicked(null)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const next = Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
                  setPicked(next);
                  (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
                }}
              >
                {rows.map((row, i) => (
                  <button
                    key={row.month}
                    type="button"
                    tabIndex={i === at ? 0 : -1}
                    aria-label={`${monthYear(row.month)}: ${row.toCome ? "not charged yet" : money(row.value, { cents: true })}`}
                    aria-pressed={i === at}
                    onClick={() => setPicked(i)}
                    onPointerEnter={() => setPicked(i)}
                    className="relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end border-0 bg-transparent p-0"
                  >
                    {row.toCome ? (
                      <span
                        className="block w-full rounded-t-[5px] border-[1.5px] border-b-0 border-dashed transition-opacity"
                        style={{
                          height: `${(likely / top) * 100}%`,
                          borderColor: `color-mix(in srgb, ${BAD} 60%, transparent)`,
                          background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${BAD} 12%, transparent) 0 5px, transparent 5px 10px)`,
                          opacity: i === at ? 1 : 0.7,
                        }}
                      />
                    ) : (
                      <span
                        className="block w-full grow rounded-t-[5px] transition-opacity"
                        style={
                          {
                            height: `max(2px, ${(row.value / top) * 100}%)`,
                            background: `linear-gradient(to top, color-mix(in srgb, ${BAD} 70%, transparent), ${BAD})`,
                            opacity: i === at ? 1 : 0.62,
                            flexGrow: 0,
                            "--i": i,
                          } as CSSProperties
                        }
                      />
                    )}
                  </button>
                ))}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink/70"
                  style={{ bottom: `${(likely / top) * 100}%` }}
                />
                {runs.slice(1).map((run) => (
                  <div
                    key={run.from}
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 border-l border-dashed border-ink-3/60"
                    style={{ left: `calc(${(run.from / n) * 100}% - 2px)` }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex gap-1" aria-hidden>
                {rows.map((row, i) => (
                  <span
                    key={row.month}
                    className={cn(
                      "mono min-w-0 flex-1 truncate text-center text-[10.5px] text-ink-3",
                      i % 2 === 1 && i !== n - 1 && "max-sm:invisible",
                      i === at && "text-ink",
                    )}
                  >
                    {MONTHS[Number(row.month.slice(5)) - 1]}
                  </span>
                ))}
              </div>
              <div
                className="mt-1.5 flex h-6 gap-1"
                role="img"
                aria-label={`The rate each month: ${runs.map((x) => `${pc(x.bp)} for ${x.n} month${x.n === 1 ? "" : "s"}`).join(", ")}`}
              >
                {runs.map((run) => {
                  const on = at >= run.from && at < run.from + run.n;
                  return (
                    <span
                      key={run.from}
                      className="mono flex min-w-0 items-center justify-center overflow-hidden rounded-md text-[11px] font-semibold whitespace-nowrap transition-[background-color,color]"
                      style={{
                        flex: `${run.n} 1 0`,
                        background: `color-mix(in srgb, ${BAD} ${on ? heat(run.bp) + 14 : heat(run.bp)}%, transparent)`,
                        color: on ? "var(--color-ink)" : "var(--color-ink-2)",
                      }}
                    >
                      {run.n >= 2 ? pc(run.bp) : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <Key>
              <i className="size-2.5 rounded-[3px]" style={{ background: BAD }} /> Charged
            </Key>
            <Key>
              <i className="w-4 border-t-[1.5px] border-dashed border-ink/70" /> At today&apos;s rate
            </Key>
            <Key>
              <i
                className="h-2.5 w-4 rounded-[3px]"
                style={{ background: `color-mix(in srgb, ${BAD} 30%, transparent)` }}
              />{" "}
              The rate that month
            </Key>
          </div>
        </div>
      )}
      <div className="text-xs text-ink-3">
        Interest is added to what we owe, so it&apos;s a cost of the loan. It isn&apos;t counted as money in or as a
        merchant.
      </div>
    </Tile>
  );
}

function Stat({ label, value, dashed }: { label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-ink-3">{label}</span>
      <span className={cn("mono text-[15px] font-semibold", dashed ? "text-ink-2" : "text-ink")}>{value}</span>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}
