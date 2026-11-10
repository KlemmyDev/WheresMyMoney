/**
 * The loan as pictures: where it stands now (what's owed, how much of it our savings cover, and where this month's
 * repayment goes) and its schedule year by year until it's gone, with levers for how fast our savings grow, an extra
 * repayment and a rate change.
 *
 * The schedule is worked out a month at a time at a fixed rate: interest is charged on what's owed less what sits in
 * the offsetting accounts, the repayment pays that interest and the rest comes off the loan, and the savings grow by
 * the chosen amount. An estimate for the household's own planning, not a forecast or advice. Money is in cents.
 */
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Details } from "~/features/common/ds";
import { colour, money, monthYear, pct } from "~/features/common/format";
import type { LoanView } from "~/features/common/queries";
import { Pill, Segmented, Tile, TileTitle, cn } from "~/features/common/ui";

const C = {
  owed: "var(--color-ink)",
  savings: "var(--color-teal)",
  interest: "var(--color-bad)",
  principal: "var(--color-good)",
};

export type Year = {
  year: number;
  /** How many months of this calendar year are in the schedule (the first and last can be part years). */
  months: number;
  interest: number;
  principal: number;
  /** Interest the offsetting accounts kept from being charged. */
  saved: number;
  owed: number;
  savings: number;
};

export type Schedule = {
  years: Year[];
  /** Months until the loan is repaid (600 if it never is). */
  months: number;
  interest: number;
  /** The first month our savings are at least what's owed: no interest from then, and it could be cleared. */
  covered: number | null;
  never: boolean;
};

/** When the offsets match the loan (or it's repaid), a month at a time; the loan and offsets a year at a time. */
type Run = { months: number; interest: number; loan: number[]; off: number[]; end: number };

export function simulate(balance: number, offset: number, rateBp: number, pay: number, grow: number): Run {
  const r = rateBp / 10000 / 12;
  let B = balance;
  let O = offset;
  let m = 0;
  let interest = 0;
  const loan = [B];
  const off = [O];
  while (m < 600) {
    const i = Math.max(0, B - O) * r;
    interest += i;
    B -= pay - i;
    O += grow;
    m++;
    if (m % 12 === 0) {
      loan.push(Math.max(0, B));
      off.push(O);
    }
    if (B <= O || B <= 0) break;
  }
  return { months: m, interest, loan, off, end: Math.max(0, B) };
}

/** The month `m` months from this one, as YYYY-MM-01. */
export function monthAhead(m: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** The loan's schedule a month at a time, gathered into calendar years. */
export function amortize(o: {
  owed: number;
  savings: number;
  rateBp: number;
  repayment: number;
  grow: number;
}): Schedule {
  const r = o.rateBp / 10000 / 12;
  let B = o.owed;
  let S = Math.max(o.savings, 0);
  let m = 0;
  let total = 0;
  let covered: number | null = S >= B ? 0 : null;
  const years: Year[] = [];
  const start = new Date();
  while (B > 0.5 && m < 600) {
    const yr = new Date(start.getFullYear(), start.getMonth() + m, 1).getFullYear();
    const i = Math.max(0, B - S) * r;
    const saved = Math.min(S, B) * r;
    const pay = Math.min(o.repayment, B + i);
    B = B + i - pay;
    S += o.grow;
    m++;
    total += i;
    if (covered == null && S >= B) covered = m;
    let y = years[years.length - 1];
    if (!y || y.year !== yr) {
      y = { year: yr, months: 0, interest: 0, principal: 0, saved: 0, owed: 0, savings: 0 };
      years.push(y);
    }
    y.months++;
    y.interest += i;
    y.principal += pay - i;
    y.saved += saved;
    y.owed = Math.max(B, 0);
    y.savings = S;
  }
  return { years, months: m, interest: total, covered, never: B > 0.5 };
}

/** "6 years 4 months" */
export function span(m: number): string {
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return (
    [y ? `${y} ${y === 1 ? "year" : "years"}` : "", mo ? `${mo} ${mo === 1 ? "month" : "months"}` : ""]
      .filter(Boolean)
      .join(" ") || "now"
  );
}

/** What's owed as a bar: the part our savings cover (each account in its colour) and the part charged interest. */
export function LoanNow({ v }: { v: LoanView }) {
  const lo = v.loan;
  const [on, setOn] = useState<number | "rest" | null>(null);
  const rate = lo.rate_bp ?? 0;
  const per = (c: number) => (Math.max(c, 0) * rate) / 10000 / 12;
  const rest = Math.max(lo.balance - v.offsetting, 0);
  const parts = v.by_account.filter((a) => a.balance > 0);
  const picked = parts.find((a) => a.id === on);
  const covered = Math.min(Math.max(v.offsetting, 0), Math.max(lo.balance, 0));
  return (
    <Tile
      i={0}
      aria-labelledby="ln-owed"
      className="lit"
      style={{
        background:
          "radial-gradient(420px 260px at 0% 0%, color-mix(in srgb, var(--color-bad) 14%, transparent), transparent 70%), var(--color-tile)",
      }}
    >
      <TileTitle id="ln-owed" right={<Pill tone="teal">{pct(v.coverage, 0)} covered</Pill>}>
        Owed
      </TileTitle>
      <div className="mono text-[40px] leading-[46px] font-semibold tracking-[-0.045em] sm:text-[46px] sm:leading-[52px]">
        {money(lo.balance)}
      </div>
      <div className="-mt-1 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
        {picked ? (
          <>
            <b className="text-ink">{picked.name}</b> {money(picked.balance)} sits against it · saves{" "}
            {money(per(picked.balance))} a month
          </>
        ) : on === "rest" ? (
          <>
            <b className="text-ink">Charged interest</b> on {money(rest)} · about {money(per(rest))} a month
          </>
        ) : (
          <>
            Our savings cover {money(covered)} of it, so interest is only charged on {money(rest)}
          </>
        )}
      </div>
      <div
        className="flex h-9 w-full gap-[3px] overflow-hidden rounded-xl"
        role="group"
        aria-label="What's owed, by what covers it"
        onPointerLeave={() => setOn(null)}
      >
        {parts.map((a, i) => (
          <button
            key={a.id}
            type="button"
            aria-label={`${a.name} ${money(a.balance)}`}
            onPointerEnter={() => setOn(a.id)}
            onFocus={() => setOn(a.id)}
            onBlur={() => setOn(null)}
            onClick={() => setOn(on === a.id ? null : a.id)}
            className="grow-x block h-full min-w-[6px] cursor-pointer transition-opacity first:rounded-l-xl"
            style={
              {
                flex: `${a.balance} 1 0`,
                background: colour(a.colour),
                opacity: on != null && on !== a.id ? 0.35 : 1,
                "--i": i,
              } as CSSProperties
            }
          />
        ))}
        {rest > 0 && (
          <button
            type="button"
            aria-label={`Charged interest on ${money(rest)}`}
            onPointerEnter={() => setOn("rest")}
            onFocus={() => setOn("rest")}
            onBlur={() => setOn(null)}
            onClick={() => setOn(on === "rest" ? null : "rest")}
            className="block h-full cursor-pointer rounded-r-xl border border-dashed transition-opacity first:rounded-l-xl"
            style={{
              flex: `${rest} 1 0`,
              borderColor: "color-mix(in srgb, var(--color-bad) 45%, transparent)",
              background:
                "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-bad) 14%, transparent) 0 6px, transparent 6px 12px)",
              opacity: on != null && on !== "rest" ? 0.45 : 1,
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12.5px] text-ink-3">
        {parts.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-full" style={{ background: colour(a.colour) }} />
            {a.name}
          </span>
        ))}
        {rest > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-full border border-dashed border-bad" />
            Charged interest
          </span>
        )}
      </div>
    </Tile>
  );
}

/** This month's repayment as a bar: the interest it pays and what comes off the loan, with what the offset saved. */
export function Repayment({ v }: { v: LoanView }) {
  const lo = v.loan;
  const [on, setOn] = useState<"interest" | "principal" | "saved" | null>(null);
  const pay = lo.repayment ?? v.charged_per_month + Math.max(v.principal_per_month, 0);
  const interest = Math.min(v.charged_per_month, pay);
  const principal = Math.max(pay - interest, 0);
  const saved = (Math.min(Math.max(v.offsetting, 0), Math.max(lo.balance, 0)) * (lo.rate_bp ?? 0)) / 10000 / 12;
  const all = pay + saved;
  const seg = (k: "interest" | "principal" | "saved", value: number, style: CSSProperties, label: string) => (
    <button
      type="button"
      aria-label={label}
      onPointerEnter={() => setOn(k)}
      onFocus={() => setOn(k)}
      onBlur={() => setOn(null)}
      onClick={() => setOn(on === k ? null : k)}
      className="grow-x block h-full min-w-[6px] cursor-pointer transition-opacity first:rounded-l-xl last:rounded-r-xl"
      style={{ flex: `${value} 1 0`, opacity: on && on !== k ? 0.35 : 1, ...style }}
    />
  );
  const said: Record<string, ReactNode> = {
    interest: (
      <>
        <b className="text-ink">{money(interest)}</b> pays this month's interest
      </>
    ),
    principal: (
      <>
        <b className="text-ink">{money(principal)}</b> comes off what we owe
      </>
    ),
    saved: (
      <>
        <b className="text-ink">{money(saved)}</b> of interest our savings kept from being charged
      </>
    ),
  };
  return (
    <Tile i={1} aria-labelledby="ln-pay">
      <TileTitle id="ln-pay" right={<span className="mono text-ink-3">{((lo.rate_bp ?? 0) / 100).toFixed(2)}%</span>}>
        This month's repayment
      </TileTitle>
      <div className="mono text-[34px] leading-10 font-semibold tracking-[-0.04em]">{money(pay)}</div>
      <div className="-mt-1 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
        {on ? said[on] : `${pct(all ? principal / pay : 0, 0)} of it comes off the loan`}
      </div>
      <div className="flex h-9 w-full gap-[3px] overflow-hidden rounded-xl" onPointerLeave={() => setOn(null)}>
        {interest > 0 && seg("interest", interest, { background: C.interest }, `Interest ${money(interest)}`)}
        {principal > 0 && seg("principal", principal, { background: C.principal }, `Off the loan ${money(principal)}`)}
        {saved > 0 &&
          seg(
            "saved",
            saved,
            {
              border: "1px dashed var(--color-teal)",
              background:
                "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-teal) 18%, transparent) 0 6px, transparent 6px 12px)",
            },
            `Saved by the offset ${money(saved)}`,
          )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[12.5px]">
        <Figure c={C.interest} label="Interest" value={money(interest)} on={on === "interest"} />
        <Figure c={C.principal} label="Off the loan" value={money(principal)} on={on === "principal"} />
        <Figure c={C.savings} dashed label="Offset saved" value={money(saved)} on={on === "saved"} />
      </div>
    </Tile>
  );
}

function Figure({
  c,
  label,
  value,
  on,
  dashed,
}: {
  c: string;
  label: string;
  value: string;
  on: boolean;
  dashed?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", on ? "opacity-100" : "opacity-90")}>
      <span className="flex items-center gap-1.5 text-ink-3">
        <i
          className={cn("size-2 flex-none rounded-full", dashed && "border border-dashed")}
          style={dashed ? { borderColor: c } : { background: c }}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="mono text-[15px] font-semibold text-ink">{value}</span>
    </div>
  );
}

type Grow = "recent" | "planned" | "none";

/**
 * The schedule until the loan is gone: what's owed and our savings against it (lines), and each year's repayments
 * split into interest and what comes off the loan (bars), with the loan without the offset dashed for comparison.
 */
export function LoanSchedule({ v }: { v: LoanView }) {
  const lo = v.loan;
  const [grow, setGrow] = useState<Grow>(v.monthly_growth > 0 ? "recent" : v.planned_growth > 0 ? "planned" : "none");
  const [extra, setExtra] = useState(0);
  const [dr, setDr] = useState(0);
  const [pt, setPt] = useState<number | null>(null);
  const rateBp = Math.max((lo.rate_bp ?? 0) + dr, 0);
  const repayment = lo.repayment ?? v.charged_per_month + Math.max(v.principal_per_month, 0);
  // The bank keeps the loan on its end date, so a higher rate raises the minimum repayment.
  const r0 = (lo.rate_bp ?? 0) / 10000 / 12;
  const left0 = r0 > 0 ? Math.log(1 - (lo.balance * r0) / repayment) / -Math.log(1 + r0) : lo.balance / repayment;
  const left = Number.isFinite(left0) && left0 > 0 ? Math.round(left0) : 360;
  const r = rateBp / 10000 / 12;
  const minPay = r > 0 ? (lo.balance * r) / (1 - Math.pow(1 + r, -left)) : lo.balance / left;
  const base = Math.max(repayment, Math.round(minPay));
  const g = grow === "recent" ? Math.max(v.monthly_growth, 0) : grow === "planned" ? Math.max(v.planned_growth, 0) : 0;
  const s = amortize({ owed: lo.balance, savings: v.offsetting, rateBp, repayment: base + extra, grow: g });
  const none = amortize({ owed: lo.balance, savings: 0, rateBp, repayment: base, grow: 0 });
  const goal = lo.goal_date;

  const n = Math.max(s.years.length, none.years.length);
  const hiOwed = Math.max(lo.balance, v.offsetting, 1);
  const hiBar = Math.max(1, ...s.years.map((y) => (y.interest + y.principal) / Math.max(y.months, 1)));
  const W = 1000;
  const TOP = 190;
  const xEdge = (k: number) => (k / n) * W;
  const yTop = (c: number) => TOP - 6 - (Math.min(c, hiOwed) / hiOwed) * (TOP - 16);
  const line = (vals: number[]) =>
    [lo.balance, ...vals].map((c, k) => `${k ? "L" : "M"}${xEdge(k).toFixed(1)} ${yTop(c).toFixed(1)}`).join("");
  const owedD = line(s.years.map((y) => y.owed));
  const noneD = line(none.years.map((y) => y.owed));
  // Our savings until they match what's owed; past that the loan could be cleared, so the line stops there.
  const coveredAt =
    s.covered == null ? s.years.length : s.years.findIndex((_, k) => s.years[k].savings >= s.years[k].owed);
  const savVals = [v.offsetting, ...s.years.map((y) => y.savings)].slice(
    0,
    (coveredAt < 0 ? s.years.length : coveredAt) + 2,
  );
  const savD = savVals.map((c, k) => `${k ? "L" : "M"}${xEdge(k).toFixed(1)} ${yTop(c).toFixed(1)}`).join("");
  const coveredYear = s.covered != null ? Number(monthAhead(s.covered).slice(0, 4)) : null;
  const goalYear = goal ? Number(goal.slice(0, 4)) : null;
  const firstYear = s.years[0]?.year ?? new Date().getFullYear();
  const at = (year: number | null) => (year == null ? -1 : year - firstYear);

  const shown = pt ?? 0;
  const yr: Year | undefined = s.years[shown];
  const noneYr: Year | undefined = none.years[shown];
  const yearLabel = firstYear + shown;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPt(Math.min(n - 1, Math.max(0, shown + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const step = Math.max(1, Math.ceil(n / 8));
  const done = monthAhead(s.months);
  const noneDone = monthAhead(none.months);

  return (
    <Tile i={2} aria-labelledby="ln-sched">
      <TileTitle id="ln-sched">The loan, year by year</TileTitle>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <Lever label="Our savings grow">
          <Segmented
            label="How our savings grow"
            options={[
              { value: "recent", label: `As lately · ${money(v.monthly_growth)}` },
              { value: "planned", label: `As planned · ${money(v.planned_growth)}` },
              { value: "none", label: "Not at all" },
            ]}
            value={grow}
            onChange={setGrow}
          />
        </Lever>
        <Lever label="Extra a month">
          <Segmented
            label="Extra repayment a month"
            options={[0, 20000, 50000, 100000].map((c) => ({ value: String(c), label: c ? `+${money(c)}` : "None" }))}
            value={String(extra)}
            onChange={(x) => setExtra(Number(x))}
          />
        </Lever>
        <Lever label="Rate">
          <Segmented
            label="Rate change"
            options={[-50, 0, 50, 100].map((d) => ({
              value: String(d),
              label: d
                ? `${d > 0 ? "+" : "−"}${Math.abs(d / 100).toFixed(2)}%`
                : `${((lo.rate_bp ?? 0) / 100).toFixed(2)}%`,
            }))}
            value={String(dr)}
            onChange={(x) => setDr(Number(x))}
          />
        </Lever>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Outcome
          label="Fully offset"
          value={s.covered === 0 ? "Already" : s.covered != null ? monthYear(monthAhead(s.covered)) : "Not yet"}
          note={
            s.covered != null && s.covered > 0
              ? `In ${span(s.covered)}: our savings match what's owed, so no more interest${goal ? ` · ${gap(monthAhead(s.covered), goal)} our ${monthYear(goal)} aim` : ""}`
              : s.covered === 0
                ? "Our savings already match what's owed"
                : "At this pace our savings don't catch up before it's repaid"
          }
          c={C.savings}
        />
        <Outcome
          label="Repaid"
          value={s.never ? "Not at this rate" : monthYear(done)}
          note={
            s.never
              ? "The repayment doesn't cover the interest"
              : `In ${span(s.months)} of repayments · ${none.never ? "" : `${span(Math.max(none.months - s.months, 0))} sooner than without the offset`}`
          }
          c={C.principal}
        />
        <Outcome
          label="Interest still to pay"
          value={money(s.interest)}
          note={none.never ? "" : `${money(Math.max(none.interest - s.interest, 0))} less than without the offset`}
          c={C.interest}
        />
      </div>

      <div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="The loan's schedule, year by year"
          aria-valuemin={firstYear}
          aria-valuemax={firstYear + n - 1}
          aria-valuenow={yearLabel}
          aria-valuetext={
            yr
              ? `${yearLabel}: owed ${money(yr.owed)}, savings ${money(yr.savings)}, interest ${money(yr.interest)}, off the loan ${money(yr.principal)}`
              : `${yearLabel}: repaid`
          }
          onKeyDown={onKey}
          onPointerLeave={(e) => e.pointerType === "mouse" && setPt(null)}
          className="relative h-[300px] touch-pan-y rounded-xl outline-offset-4 select-none"
        >
          <svg
            viewBox={`0 0 ${W} 300`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1="0"
                x2={W}
                y1={yTop(hiOwed * f)}
                y2={yTop(hiOwed * f)}
                stroke="var(--color-line)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1="0"
              x2={W}
              y1={TOP + 8}
              y2={TOP + 8}
              stroke="var(--color-line-2)"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={noneD}
              fill="none"
              stroke="var(--color-ink-3)"
              strokeWidth="1.5"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={`${owedD}L${xEdge(s.years.length)} ${TOP - 6}L0 ${TOP - 6}Z`}
              fill="color-mix(in srgb, var(--color-bad) 10%, transparent)"
              className="fill-after"
            />
            <path
              d={owedD}
              fill="none"
              stroke={C.owed}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={savD}
              fill="none"
              stroke={C.savings}
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {s.years.map((y, k) => {
              const w = W / n;
              const scale = (c: number) => (c / Math.max(y.months, 1) / hiBar) * 84;
              const hI = scale(y.interest);
              const hP = scale(y.principal);
              const bw = Math.max(w * 0.62, 2);
              const x0 = xEdge(k) + (w - bw) / 2;
              return (
                <g key={y.year} opacity={pt != null && pt !== k ? 0.4 : 1}>
                  <rect x={x0} y={300 - hP} width={bw} height={hP} fill={C.principal} rx="2" />
                  <rect x={x0} y={300 - hP - hI} width={bw} height={hI} fill={C.interest} rx="2" />
                </g>
              );
            })}
          </svg>
          {[
            { k: at(coveredYear), label: "Fully offset", c: C.savings },
            { k: at(goalYear), label: "Our aim", c: "var(--color-ink-3)" },
          ]
            .filter((m) => m.k >= 0 && m.k < n)
            // A second marker's label sits a row lower, so close dates never overlap; near the right edge it hangs left.
            .map((m, row) => (
              <span
                key={m.label}
                aria-hidden
                className="pointer-events-none absolute top-0 border-l border-dashed"
                style={{ left: `${((m.k + 0.5) / n) * 100}%`, height: TOP, borderColor: m.c }}
              >
                <span
                  className="absolute rounded-md bg-tile/85 px-1 text-[11px] whitespace-nowrap"
                  style={{
                    color: m.c,
                    top: 4 + row * 20,
                    ...((m.k + 0.5) / n > 0.75 ? { right: 4 } : { left: 4 }),
                  }}
                >
                  {m.label}
                </span>
              </span>
            ))}
          <div className="absolute inset-0 flex">
            {Array.from({ length: n }, (_, k) => (
              <div
                key={k}
                className={cn("h-full flex-1 cursor-crosshair", pt === k && "bg-ink/5")}
                onPointerEnter={() => setPt(k)}
                onPointerDown={() => setPt(k)}
              />
            ))}
          </div>
          <span className="pointer-events-none absolute bottom-[94px] left-0 text-[10.5px] text-ink-3">
            Each year's repayments, a month on average
          </span>
        </div>
        <div className="relative mt-1.5 h-4 text-[11px] text-ink-3">
          {Array.from({ length: n }, (_, k) => k)
            .filter((k) => (k % step === 0 && n - 1 - k > step * 0.75) || k === n - 1)
            .map((k) => (
              <span
                key={k}
                className="mono absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${((k + 0.5) / n) * 100}%` }}
              >
                {firstYear + k}
              </span>
            ))}
        </div>
      </div>

      <div
        className="grid min-h-[66px] grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-line bg-raised/40 p-3 text-[12.5px] sm:grid-cols-[auto_repeat(5,minmax(0,1fr))]"
        aria-live="polite"
      >
        <div className="col-span-2 flex flex-col sm:col-span-1">
          <span className="text-ink-3">{pt == null ? "This year" : "Year"}</span>
          <b className="mono text-[17px] text-ink">
            {yearLabel}
            {yr && yr.months < 12 ? (
              <span className="text-[12px] font-normal text-ink-3"> · {yr.months} mo</span>
            ) : null}
          </b>
        </div>
        {yr ? (
          <>
            <Read c={C.owed} label="Owed at the end" value={money(yr.owed)} />
            <Read c={C.savings} label="Our savings" value={money(yr.savings)} />
            <Read c={C.interest} label="Interest" value={money(yr.interest)} />
            <Read c={C.principal} label="Off the loan" value={money(yr.principal)} />
            <Read
              c="var(--color-ink-3)"
              dashed
              label="Without the offset"
              value={noneYr ? `${money(noneYr.owed)} owed` : "repaid"}
            />
          </>
        ) : (
          <span className="col-span-2 self-center text-ink-3 sm:col-span-5">
            Repaid by then{noneYr ? `; without the offset we'd still owe ${money(noneYr.owed)}` : ""}.
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
        <Key c={C.owed} label="Owed" />
        <Key c={C.savings} label="Our savings against it" />
        <Key c="var(--color-ink-3)" dashed label="Owed without the offset" />
        <Key c={C.interest} label="Interest" bar />
        <Key c={C.principal} label="Off the loan" bar />
      </div>

      <Details label="See the schedule as a table">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                {["Year", "Interest", "Off the loan", "Offset saved", "Owed at end", "Our savings"].map((h, k) => (
                  <th key={h} className={cn("border-b border-line py-2 font-semibold", k > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="mono">
              {s.years.map((y) => (
                <tr key={y.year}>
                  <td className="border-b border-line py-2">
                    {y.year}
                    {y.months < 12 && <span className="text-ink-3"> · {y.months} mo</span>}
                  </td>
                  <td className="border-b border-line py-2 text-right">{money(y.interest)}</td>
                  <td className="border-b border-line py-2 text-right">{money(y.principal)}</td>
                  <td className="border-b border-line py-2 text-right text-teal">{money(y.saved)}</td>
                  <td className="border-b border-line py-2 text-right">{money(y.owed)}</td>
                  <td className="border-b border-line py-2 text-right">{money(y.savings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Details>
      <div className="text-xs text-ink-3">
        Worked out a month at a time at {(rateBp / 100).toFixed(2)}% with {money(base + extra)} a month going in
        {base > repayment ? ` (the bank would raise the repayment to ${money(base)} at this rate)` : ""}
        {none.never ? "" : `; without the offset it's repaid by ${monthYear(noneDone)}`}. An estimate for our own
        planning, not advice.
      </div>
    </Tile>
  );
}

function Lever({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <div className="max-w-full overflow-x-auto">{children}</div>
    </div>
  );
}

function Outcome({ label, value, note, c }: { label: string; value: string; note: string; c: string }) {
  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 rounded-2xl border p-3.5"
      style={{
        borderColor: `color-mix(in srgb, ${c} 35%, var(--color-line))`,
        background: `color-mix(in srgb, ${c} 7%, var(--color-tile))`,
      }}
    >
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className="mono text-[22px] leading-7 font-semibold tracking-[-0.03em] text-ink">{value}</span>
      <span className="text-[12px] leading-snug text-ink-3">{note}</span>
    </div>
  );
}

function Read({ c, label, value, dashed }: { c: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5 text-ink-3">
        <i
          className={cn("size-2 flex-none rounded-full", dashed && "border border-dashed")}
          style={dashed ? { borderColor: c } : { background: c }}
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="num text-[14px] text-ink">{value}</span>
    </div>
  );
}

function Key({ c, label, dashed, bar }: { c: string; label: string; dashed?: boolean; bar?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {bar ? (
        <i className="h-2.5 w-2 rounded-[2px]" style={{ background: c }} />
      ) : (
        <i className="w-4" style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${c}`, height: 0 }} />
      )}
      {label}
    </span>
  );
}

function gap(date: string, goal: string): string {
  const [y1, m1] = date.split("-").map(Number);
  const [y2, m2] = goal.split("-").map(Number);
  const months = (y2 - y1) * 12 + (m2 - m1);
  if (months === 0) return "right on";
  return months > 0 ? `${span(months)} before` : `${span(-months)} after`;
}
