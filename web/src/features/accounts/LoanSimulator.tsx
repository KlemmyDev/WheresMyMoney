/**
 * "When could it be gone?": move the levers (extra repayment, how fast the offsets grow, a rate change) and see when
 * the offsets match the loan, how much sooner than with no offset, and the interest saved. Month by month at a fixed
 * rate: an estimate for planning, not a forecast. Money is in cents.
 */
import { useState } from "react";
import { Card, CardHead, ChoiceChip, Stat } from "~/features/common/ds";
import { money, monthYear } from "~/features/common/format";
import { Pill, Segmented } from "~/features/common/ui";

type Run = { months: number; interest: number; loan: number[]; off: number[]; end: number };

function simulate(balance: number, offset: number, rateBp: number, pay: number, grow: number): Run {
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

const addMonths = (m: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const span = (m: number) => `${Math.floor(m / 12)}y ${m % 12}m`;

export function LoanSimulator({
  balance,
  offsetting,
  rateBp,
  repayment,
  recentGrowth,
}: {
  balance: number;
  offsetting: number;
  rateBp: number;
  repayment: number;
  recentGrowth: number;
}) {
  const [extra, setExtra] = useState(0);
  // Growth choices scale from the household's own recent pace (rounded to $100).
  const pace = Math.max(0, Math.round(recentGrowth / 10000) * 10000);
  const choices =
    pace > 0
      ? [0, Math.round(pace / 20000) * 10000, pace, Math.round((pace * 1.5) / 10000) * 10000]
      : [0, 50000, 100000, 150000];
  const [grow, setGrow] = useState(pace);
  const [dr, setDr] = useState("0");
  const rate = rateBp + Number(dr);
  const r = rate / 10000 / 12;
  // The bank keeps the loan on its original end date, so a higher rate raises the minimum repayment.
  const months0 = Math.log(1 - (balance * (rateBp / 10000 / 12)) / repayment) / -Math.log(1 + rateBp / 10000 / 12);
  const left = Number.isFinite(months0) && months0 > 0 ? Math.round(months0) : 360;
  const minPay = r > 0 ? (balance * r) / (1 - Math.pow(1 + r, -left)) : balance / left;
  const base = Math.max(repayment, Math.round(minPay));
  const sim = simulate(balance, offsetting, rate, base + extra, grow);
  const none = simulate(balance, 0, rate, base, 0);
  const sooner = none.months - sim.months;
  const W = 600;
  const H = 200;
  const total = Math.max(none.months, 12);
  const x = (m: number) => ((m / total) * W).toFixed(1);
  const y = (v: number) => (H - 6 - (Math.min(v, balance) / balance) * (H - 16)).toFixed(1);
  const path = (arr: number[], endM: number, endV: number) =>
    arr.map((v, k) => `${k ? "L" : "M"}${x(k * 12)} ${y(v)}`).join(" ") + ` L${x(endM)} ${y(endV)}`;
  const loanPath = path(sim.loan, sim.months, sim.end);
  const offPath = path(sim.off, sim.months, sim.end);
  return (
    <Card lit aria-labelledby="sim">
      <CardHead id="sim" title="When could it be gone?" right={<Pill tone="mute">Estimate</Pill>} />
      <p className="m-0 -mt-1 text-[13px] text-ink-3">
        Move the levers. The loan counts as gone when the offsets match it.
      </p>
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="sim-extra" className="font-semibold">
                Extra repayment
              </label>
              <span className="num text-teal">{money(extra)} a month</span>
            </div>
            <input
              id="sim-extra"
              type="range"
              className="range"
              min={0}
              max={200000}
              step={10000}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              style={{ ["--p" as string]: `${(extra / 200000) * 100}%` }}
            />
          </div>
          <div>
            <div className="font-semibold">Offsets grow by, each month</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {choices.map((v) => (
                <ChoiceChip key={v} pressed={grow === v} onClick={() => setGrow(v)}>
                  {v === 0 ? "Nothing" : v === pace ? `+${money(v)} · your pace` : `+${money(v)}`}
                </ChoiceChip>
              ))}
            </div>
            <div className="mt-1.5 text-[13px] text-ink-3">Your recent pace: about {money(recentGrowth)}.</div>
          </div>
          <div>
            <div className="font-semibold">If the rate moves</div>
            <div className="mt-2">
              <Segmented
                label="Rate change"
                value={dr}
                onChange={setDr}
                options={[
                  { value: "-50", label: "−0.5%" },
                  { value: "0", label: "Now" },
                  { value: "25", label: "+0.25%" },
                  { value: "50", label: "+0.5%" },
                ]}
              />
            </div>
            <div className="mt-1.5 text-[13px] text-ink-3">
              {(rate / 100).toFixed(2)}%: repayment {money(base)} a month
              {base > repayment ? `, up ${money(base - repayment)}` : ""}.
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Stat label="Gone by" value={monthYear(addMonths(sim.months))} note={`in ${span(sim.months)}`} />
            <Stat
              label="Sooner than no offset"
              value={span(Math.max(0, sooner))}
              note={`without: ${monthYear(addMonths(none.months))}`}
              role="savings"
            />
            <Stat
              label="Interest saved"
              value={money(Math.max(0, none.interest - sim.interest))}
              note="over the life of the loan"
              role="offset"
            />
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-[200px] w-full"
            role="img"
            aria-label={`Loan meets the offsets in ${monthYear(addMonths(sim.months))}`}
          >
            <defs>
              <linearGradient id="sim-off" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-offset-fill)" stopOpacity={0.4} />
                <stop offset="1" stopColor="var(--color-offset-fill)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d={path(none.loan, none.months, 0)}
              fill="none"
              stroke="var(--color-ink-3)"
              strokeWidth={1.5}
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
            <path d={`${offPath} L${x(sim.months)} ${H} L0 ${H} Z`} fill="url(#sim-off)" />
            <path
              d={offPath}
              fill="none"
              stroke="var(--color-offset)"
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={loanPath}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="flex flex-wrap gap-4 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-3.5 bg-ink" /> Loan
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-3.5 bg-offset" /> Offsets
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="w-3.5 border-t-2 border-dashed border-ink-3" /> Loan with no offset
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
