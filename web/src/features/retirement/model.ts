/**
 * The retirement estimate, a year at a time in today's dollars.
 *
 * Each person's super grows at its fund's return (its investment options' returns weighted by their shares, or the
 * household's assumption), less its fees: those on the balance (admin, investment) come off as a share, those in
 * dollars (admin, insurance) come off each year while there's a balance. Inflation is taken out, so every figure is
 * in today's dollars (dollar fees and salaries are taken to rise with prices). While working, super takes the
 * employer's contributions (and any extra) less the tax on money going in; the ETFs grow at their return less their
 * management fees and take what's been going in lately.
 *
 * Everyone stops in the same year, when the first person reaches the age chosen. Once stopped, each year's spending
 * (plus the loan's repayments until it's gone) comes from the ETFs first, then from the super of anyone 60 or over.
 * A shortfall while someone's super is locked is a gap before super opens; otherwise the money has run out. The age
 * pension isn't counted, so it errs on the careful side. Money in cents; rates as fractions (0.07 is 7%).
 */

export type Fee = { name: string; kind: "pct" | "fixed"; amount: number };
export type Option = { name: string; share: number; return_pct: number | null; fee_pct: number };
export type Person = { age: number; balance: number; salary: number; rate: number; fees: Fee[]; options: Option[] };

export type Assumptions = {
  superReturn: number;
  etfReturn: number;
  etfFee: number;
  inflation: number;
  contribTax: number;
};

export type Inputs = Assumptions & {
  people: Person[];
  etfs: number;
  etfPerYear: number;
  loanRepaymentYear: number;
  /** The calendar year the loan's gone (null: no loan). */
  loanEnds: number | null;
  year: number;
  retireAge: number;
  spending: number;
  extraMonth: number;
  countEtfs: boolean;
  planTo: number;
  preservation: number;
};

export type Row = { year: number; age: number; super: number; etfs: number };
export type Result = { rows: Row[]; out: number | null; gap: number | null; ok: boolean; atRetire: Row | null };

/** A fund's terms: its return before fees, fees on the balance (a share a year), fees in dollars a year, and what
 * a dollar grows by in a year after fees on the balance and inflation (dollar fees aside). */
export function fundTerms(p: Pick<Person, "fees" | "options">, a: Assumptions) {
  const ret = p.options.length
    ? p.options.reduce((s, o) => s + o.share * (o.return_pct ?? a.superReturn), 0)
    : a.superReturn;
  const pct =
    p.fees.filter((f) => f.kind === "pct").reduce((s, f) => s + f.amount, 0) +
    p.options.reduce((s, o) => s + o.share * o.fee_pct, 0);
  const fixed = p.fees.filter((f) => f.kind === "fixed").reduce((s, f) => s + f.amount, 0);
  return { ret, pct, fixed, real: (1 + ret - pct) / (1 + a.inflation) - 1 };
}

const LAST = 100;

export function project(i: Inputs, retireAge = i.retireAge): Result {
  if (!i.people.length) return { rows: [], out: null, gap: null, ok: false, atRetire: null };
  const lead = i.people[0];
  const terms = i.people.map((p) => fundTerms(p, i));
  const etfGrowth = (1 + i.etfReturn - i.etfFee) / (1 + i.inflation);
  const supers = i.people.map((p) => p.balance);
  let etfs = i.countEtfs ? i.etfs : 0;
  const rows: Row[] = [];
  let out: number | null = null;
  let gap: number | null = null;
  const extraEach = (i.extraMonth * 12) / i.people.length;
  for (let n = 0; lead.age + n <= LAST; n++) {
    const age = lead.age + n;
    const year = i.year + n;
    rows.push({
      year,
      age,
      super: Math.max(
        0,
        supers.reduce((a, b) => a + b, 0),
      ),
      etfs: Math.max(0, etfs),
    });
    supers.forEach((s, k) => {
      supers[k] = s > 0 ? Math.max(0, s * (1 + terms[k].real) - terms[k].fixed) : s;
    });
    etfs *= etfGrowth;
    if (age < retireAge) {
      i.people.forEach((p, k) => (supers[k] += (p.salary * p.rate + extraEach) * (1 - i.contribTax)));
      if (i.countEtfs) etfs += i.etfPerYear;
      continue;
    }
    let need = i.spending + (i.loanEnds != null && year < i.loanEnds ? i.loanRepaymentYear : 0);
    const fromEtfs = Math.min(Math.max(etfs, 0), need);
    etfs -= fromEtfs;
    need -= fromEtfs;
    let locked = false;
    i.people.forEach((p, k) => {
      if (p.age + n < i.preservation) {
        if (supers[k] > 1) locked = true;
        return;
      }
      const take = Math.min(Math.max(supers[k], 0), need);
      supers[k] -= take;
      need -= take;
    });
    if (need > 100) {
      if (locked) gap ??= age;
      else out ??= age;
    }
  }
  const ok = gap == null && (out == null || out >= i.planTo);
  return { rows, out, gap, ok, atRetire: rows.find((r) => r.age === retireAge) ?? null };
}

/** The earliest age to stop (45 to 70) that lasts to the plan-to age with no gap before super opens. */
export function earliest(i: Inputs): number | null {
  for (let a = Math.max(45, i.people[0]?.age ?? 45); a <= 70; a++) if (project(i, a).ok) return a;
  return null;
}
