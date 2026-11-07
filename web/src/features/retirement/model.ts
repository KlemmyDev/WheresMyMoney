/**
 * The retirement estimate, a year at a time in today's dollars (so growth is after fees and inflation).
 *
 * While working: each person's super grows and takes their employer's contributions (and any extra) less 15% tax going
 * in; the ETFs grow and take what's been going in lately. Everyone stops in the same year, when the first person
 * reaches the age chosen. Once stopped, each year's spending (plus the loan's repayments until it's gone) comes from
 * the ETFs first, then from the super of anyone 60 or over. If there's still a shortfall while someone's super is
 * locked, that's a gap before super opens; if not, the money has run out. The age pension isn't counted, so it errs
 * on the careful side. Money in cents.
 */

export type Person = { age: number; balance: number; salary: number; rate: number };

export type Inputs = {
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
  growth: number;
  planTo: number;
  preservation: number;
};

export type Row = { year: number; age: number; super: number; etfs: number };
export type Result = { rows: Row[]; out: number | null; gap: number | null; ok: boolean; atRetire: Row | null };

const LAST = 100;

export function project(i: Inputs, retireAge = i.retireAge): Result {
  if (!i.people.length) return { rows: [], out: null, gap: null, ok: false, atRetire: null };
  const lead = i.people[0];
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
    supers.forEach((s, k) => (supers[k] = s * (1 + i.growth)));
    etfs *= 1 + i.growth;
    if (age < retireAge) {
      i.people.forEach((p, k) => (supers[k] += (p.salary * p.rate + extraEach) * 0.85));
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
