/**
 * Retirement (the canvas's Future · Retirement): when the household could stop work, from each person's super, the
 * ETFs and the loan plan, in today's dollars. The levers ("Try it") answer straight away and are kept for next time.
 * An estimate to plan with, not advice.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import {
  BigNumber,
  Card,
  CardHead,
  ChoiceChip,
  EmptyState,
  Eyebrow,
  ROLE,
  Sheet,
  Stat,
  Details,
} from "~/features/common/ds";
import { money, monthYear, parseMoney } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import {
  accountsQuery,
  investmentsQuery,
  loanQuery,
  refresh,
  retirementQuery,
  type RetirementData,
  type RetirementSettings,
  type SuperAccount,
} from "~/features/common/queries";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, ErrorText, Input, PageHead, Pill, Switch } from "~/features/common/ui";
import { assumptionsOf, etfFeeOf } from "~/features/retirement/Assumptions";
import { earliest, fundTerms, project, type Inputs } from "~/features/retirement/model";

const pct = (f: number, dp = 2) => `${(f * 100).toFixed(dp).replace(/\.?0+$/, "")}%`;

const AVATARS = [
  "linear-gradient(135deg, #8b7bff, #f472b6)",
  "linear-gradient(135deg, #34d399, #5b84f5)",
  "linear-gradient(135deg, #f59e2e, #ec5f9c)",
  "linear-gradient(135deg, #67e8f9, #8b7bff)",
];
const k = (c: number) => money(Math.round(c / 100000) * 100000);

export function RetirementPage() {
  const q = useQuery(retirementQuery);
  const inv = useQuery(investmentsQuery);
  const loan = useQuery(loanQuery);
  const accounts = useQuery(accountsQuery);
  const [editing, setEditing] = useState<SuperAccount | "new" | null>(null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const r = q.data;
  return (
    <>
      <PageHead over="Future" title="Retirement" />
      <p className="m-0 -mt-2 max-w-[640px] text-[14px] text-ink-3">
        When you could stop work, from your super, your ETFs and the loan plan. All in today's dollars. An estimate to
        plan with, not advice.
      </p>
      {r.people.length === 0 ? (
        <EmptyState
          g={I.retire}
          tone="savings"
          title="Add your super to start"
          action={
            <Button primary onClick={() => setEditing("new")}>
              Add your super
            </Button>
          }
        >
          Each person's super balance, salary and the year they were born. Add a partner's too, and the estimate plans
          for both of you.
        </EmptyState>
      ) : (
        <Plan
          r={r}
          etfs={inv.data?.total ?? 0}
          etfPerYear={etfPace(inv.data?.trades ?? [])}
          etfFee={etfFeeOf(inv.data?.funds, r.settings.etf_fee)}
          loanEnds={loan.data ? Number((loan.data.recent.date ?? "").slice(0, 4)) || null : null}
          loanRepayment={(loan.data?.loan.repayment ?? 0) * 12}
          goals={accounts.data?.goals ?? []}
          onEdit={setEditing}
        />
      )}
      <PersonSheet person={editing} onClose={() => setEditing(null)} />
    </>
  );
}

/** What's gone into the ETFs over the last year (buys less sells), in cents. */
function etfPace(trades: { date: string; side: string; amount: number }[]) {
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const iso = since.toISOString().slice(0, 10);
  return Math.max(
    0,
    trades.filter((t) => t.date > iso).reduce((s, t) => s + (t.side === "buy" ? t.amount : -t.amount), 0),
  );
}

function Plan({
  r,
  etfs,
  etfPerYear,
  etfFee,
  loanEnds,
  loanRepayment,
  goals,
  onEdit,
}: {
  r: RetirementData;
  etfs: number;
  etfPerYear: number;
  etfFee: number;
  loanEnds: number | null;
  loanRepayment: number;
  goals: { name: string; by_date: string | null }[];
  onEdit: (p: SuperAccount | "new") => void;
}) {
  const data = r;
  const qc = useQueryClient();
  const [s, setS] = useState<RetirementSettings>(data.settings);
  // Keep the levers a moment after the last change.
  const keep = useMutation({
    mutationFn: (v: RetirementSettings) => apiSend("PUT", "retirement/settings", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retirement"] }),
  });
  useEffect(() => {
    if (JSON.stringify(s) === JSON.stringify(data.settings)) return;
    const t = setTimeout(() => keep.mutate(s), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  const set = (patch: Partial<RetirementSettings>) => setS((v) => ({ ...v, ...patch }));

  const people = data.people;
  const lead = people[0];
  const inputs: Inputs = {
    ...assumptionsOf(s, etfFee),
    people: people.map((p) => ({
      age: p.age,
      balance: p.balance,
      salary: p.salary,
      rate: p.rate,
      fees: p.fees,
      options: p.options,
    })),
    etfs,
    etfPerYear,
    loanRepaymentYear: loanRepayment,
    loanEnds,
    year: data.year,
    retireAge: s.retire_age,
    spending: s.spending,
    extraMonth: s.extra,
    countEtfs: s.count_etfs,
    planTo: s.plan_to,
    preservation: data.preservation,
  };
  // Cheap (a few thousand steps), so worked out on every render.
  const res = project(inputs);
  const first = earliest(inputs);
  const R = s.retire_age;
  const retireYear = data.year + (R - lead.age);
  const others = people.slice(1).map((p) => `${p.person} ${p.age + (R - lead.age)}`);
  const lasts = res.out == null ? "past 100" : `to ${res.out}`;
  const rows = res.rows.filter((x) => x.age <= 95);
  const bridge = Math.max(0, data.preservation - R);
  const headline = res.ok ? `Stop at ${R} in ${retireYear}` : `At ${R}, money runs short`;
  const pill = res.ok ? `Lasts ${lasts}` : res.gap != null ? `Gap at ${res.gap}` : `Runs out at ${res.out}`;
  const sub = res.ok
    ? `Spending ${k(s.spending)} a year, the money lasts ${lasts}.`
    : res.gap != null
      ? `The ETFs run out at ${res.gap}, before super opens at ${data.preservation}. Count them, stop later or spend less.`
      : `At ${k(s.spending)} a year it lasts to ${res.out}. The earliest that lasts to ${s.plan_to} is ${first ?? "after 70"}.`;
  const idxOf = (age: number) => rows.findIndex((x) => x.age === age);

  const miles: { year: number; title: string; sub: string; g: Glyph; tone: Tone }[] = [
    ...(loanEnds
      ? [
          {
            year: loanEnds,
            title: "Loan gone",
            sub: `${money(loanRepayment / 12)} a month freed up`,
            g: I.loan,
            tone: "offset" as Tone,
          },
        ]
      : []),
    {
      year: retireYear,
      title: "Stop work",
      sub: [`${lead.person} ${R}`, ...others].join(" · "),
      g: I.retire,
      tone: "savings" as Tone,
    },
    ...people.map((p) => ({
      year: p.opens,
      title: `${p.person}'s super opens`,
      sub: `At ${data.preservation}`,
      g: I.shield,
      tone: "invest" as Tone,
    })),
    ...goals
      .filter((g) => g.by_date)
      .map((g) => ({
        year: Number(g.by_date!.slice(0, 4)),
        title: g.name,
        sub: `Goal, ${monthYear(g.by_date!)}`,
        g: I.savings,
        tone: "savings" as Tone,
      })),
  ].sort((a, b) => a.year - b.year);

  return (
    <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
      <Card lit aria-labelledby="rt-hero" className="flex flex-col gap-4 md:col-span-8">
        <div>
          <Eyebrow id="rt-hero">On these settings</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <BigNumber size="lg">{headline}</BigNumber>
            <Pill tone={res.ok ? "good" : "warn"}>{pill}</Pill>
          </div>
          <p className="m-0 mt-1 text-[14px] text-ink-2">{sub}</p>
        </div>
        <ScrubChart
          label={`Savings by age. Stop at ${R}, money lasts ${lasts}`}
          lines={[
            { name: "Super + ETFs", values: rows.map((x) => x.super + x.etfs), colour: ROLE.invest, fill: true },
            { name: "Super", values: rows.map((x) => x.super), colour: ROLE.savings, fill: true },
          ]}
          at={(i) => (rows[i] ? `${lead.person} ${rows[i].age} · ${rows[i].year}` : "")}
          format={(v) => k(v)}
          floor={0}
          height={210}
          marks={[
            { i: idxOf(R), label: `Stop at ${R}`, colour: "var(--color-ink-2)" },
            ...(!res.ok && res.out != null && res.out <= 95
              ? [{ i: idxOf(res.out), label: `Runs out at ${res.out}`, colour: "var(--color-bills)" }]
              : []),
          ].filter((m) => m.i >= 0)}
          axis={[0, ...[50, 60, 70, 80].map(idxOf).filter((i) => i > 0), rows.length - 1]}
          axisAt={(i) => (rows[i] ? (i === 0 ? `${lead.person} ${rows[i].age}` : String(rows[i].age)) : "")}
        />
        <div className="flex flex-wrap gap-4 text-[13px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm" style={{ background: ROLE.savings }} />
            Super{people.length > 1 ? ", both of you" : ""}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm" style={{ background: ROLE.invest }} />
            ETFs
          </span>
        </div>
      </Card>

      <Card aria-labelledby="rt-try" className="flex flex-col gap-5 md:col-span-4">
        <CardHead id="rt-try" title="Try it" />
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="rt-age" className="font-semibold">
              Stop work at
            </label>
            <span className="num text-[14px]">{[`${lead.person} ${R}`, ...others].join(" · ")}</span>
          </div>
          <input
            id="rt-age"
            type="range"
            className="range mt-2 w-full"
            min={Math.max(45, lead.age)}
            max={70}
            value={R}
            onChange={(e) => set({ retire_age: Number(e.target.value) })}
            style={{
              ["--p" as string]: `${((R - Math.max(45, lead.age)) / (70 - Math.max(45, lead.age))) * 100}%`,
              ["--c" as string]: ROLE.savings,
            }}
          />
          <div className="text-[13px] text-ink-3">That's {retireYear}.</div>
        </div>
        <div>
          <div className="font-semibold">Spending each year once stopped</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[6000000, 8000000, 10000000].map((v) => (
              <ChoiceChip key={v} pressed={s.spending === v} onClick={() => set({ spending: v })} role="savings">
                {k(v)}
              </ChoiceChip>
            ))}
          </div>
          <div className="mt-1.5 text-[13px] text-ink-3">
            Now you spend about {k(data.spending_now)} a year{loanEnds ? ", plus the loan" : ""}.
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="rt-extra" className="font-semibold">
              Extra into super
            </label>
            <span className="num text-[14px]">{money(s.extra)} a month</span>
          </div>
          <input
            id="rt-extra"
            type="range"
            className="range mt-2 w-full"
            min={0}
            max={100000}
            step={5000}
            value={s.extra}
            onChange={(e) => set({ extra: Number(e.target.value) })}
            style={{ ["--p" as string]: `${(s.extra / 100000) * 100}%`, ["--c" as string]: ROLE.savings }}
          />
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Count the ETFs</span>
            <span className="block text-[13px] text-ink-3">
              They bridge the years before super opens at {data.preservation}
            </span>
          </span>
          <Switch checked={s.count_etfs} onChange={(v) => set({ count_etfs: v })} label="Count the ETFs" />
        </label>
        {keep.isError && <ErrorText>{errorMessage(keep.error)}</ErrorText>}
      </Card>

      <div className="grid grid-cols-2 gap-2.5 md:col-span-12 md:grid-cols-4">
        <Stat
          label="Earliest we could stop"
          value={first ? `Age ${first}` : "After 70"}
          note={`and still have enough until ${s.plan_to}`}
          role="savings"
        />
        <Stat
          label="Saved by then"
          value={res.atRetire ? k(res.atRetire.super + res.atRetire.etfs) : "—"}
          note={res.atRetire ? `${k(res.atRetire.super)} super, ${k(res.atRetire.etfs)} ETFs` : undefined}
          role="invest"
        />
        <Stat
          label="Loan gone"
          value={loanEnds ?? "—"}
          note={loanEnds ? `at today's pace, ${lead.person} ${lead.age + (loanEnds - data.year)}` : "no loan"}
          role="offset"
        />
        <Stat
          label="Before super opens"
          value={bridge ? `${bridge} year${bridge > 1 ? "s" : ""}` : "None"}
          note={
            bridge
              ? res.gap != null
                ? `ETFs run out at ${res.gap}`
                : "covered by the ETFs"
              : "super opens when you stop"
          }
          role={res.gap != null ? "bills" : "invest"}
        />
      </div>

      <Card aria-labelledby="rt-super" className="flex flex-col gap-2 md:col-span-7">
        <CardHead
          id="rt-super"
          title={people.length > 1 ? "Super, each of you" : "Super"}
          right={
            <Button small onClick={() => onEdit("new")}>
              Add a person
            </Button>
          }
        />
        {people.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onEdit(p)}
            aria-label={`${p.person}, ${p.age}: ${money(p.balance)} in ${p.fund || "super"}. Update`}
            className="press flex cursor-pointer items-center gap-3 rounded-2xl border-0 border-t border-line bg-transparent px-1 py-3 text-left text-ink first:border-t-0 hover:bg-tile-2"
          >
            <span
              aria-hidden
              className="flex size-11 flex-none items-center justify-center rounded-full text-[16px] font-semibold text-white"
              style={{ background: AVATARS[i % AVATARS.length] }}
            >
              {p.person.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {p.person}, {p.age}
              </span>
              <span className="block truncate text-[13px] text-ink-2">{p.fund || "Super"}</span>
              <span className="block truncate text-[12px] text-ink-3">
                {Math.round(p.rate * 100)}% of {k(p.salary)}
                {s.extra ? ` + ${money(s.extra / people.length)}/mo extra` : ""} · opens in {p.opens}
              </span>
            </span>
            <span className="flex-none text-right">
              <span className="num block text-[16px]">{money(p.balance)}</span>
              <span className="block text-[12px] text-ink-3">{p.as_of ? monthYear(p.as_of) : ""}</span>
            </span>
            <span aria-hidden className="text-ink-3">
              ›
            </span>
          </button>
        ))}
      </Card>

      <Card aria-labelledby="rt-assume" className="flex flex-col gap-1 md:col-span-5">
        <CardHead
          id="rt-assume"
          title="What the estimate assumes"
          right={
            <Link
              to="/settings"
              search={{ section: "retirement" }}
              className="text-[13px] font-semibold text-teal no-underline"
            >
              Change in Settings
            </Link>
          }
        />
        <p className="m-0 text-[14px] text-ink-2">
          Growth of about {pct(fundTerms(people[0], inputs).real, 1)} a year for {people[0].person}'s super after fees
          and rising prices, spending of {k(s.spending)} a year, and no age pension, so it errs on the careful side.
        </p>
        <Details label="See every assumption">
          <p className="m-0 -mt-1 text-[12px] text-ink-3">A year. The right-hand figure is after fees and inflation.</p>
          {[
            ...people.map((p) => {
              const t = fundTerms(p, inputs);
              return [
                `${p.person}'s super${p.fund ? `, ${p.fund}` : ""}`,
                `${pct(t.ret)} before fees · ${pct(t.pct)} + ${money(t.fixed)} a year in fees`,
                `${pct(t.real, 1)}`,
              ];
            }),
            [
              "ETFs",
              `${pct(inputs.etfReturn)} before fees · ${pct(etfFee)} in fees`,
              pct((1 + inputs.etfReturn - etfFee) / (1 + inputs.inflation) - 1, 1),
            ],
            ["Inflation", "Taken out, so it's all in today's dollars", pct(inputs.inflation)],
            ["Tax on money going in", "Employer and extra contributions", pct(inputs.contribTax)],
            ["Into ETFs while working", "Your pace over the last year", `${k(etfPerYear)}/yr`],
            ["Loan repayments until gone", "From Loan and offset", loanEnds ? `${k(loanRepayment)}/yr` : "No loan"],
            ["Plan to", "How long the money should last", `Age ${s.plan_to}`],
          ].map(([n, sb, v]) => (
            <div key={n} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">{n}</span>
                <span className="block text-[12px] text-ink-3">{sb}</span>
              </span>
              <span className="num text-[14px]">{v}</span>
            </div>
          ))}
        </Details>
      </Card>

      <Card aria-labelledby="rt-miles" className="flex flex-col gap-2 md:col-span-12">
        <CardHead
          id="rt-miles"
          title="Along the way"
          right={<span className="text-[13px] text-ink-3">From your plans across the app</span>}
        />
        <div className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
          {miles.map((m) => (
            <div
              key={`${m.year}${m.title}`}
              className="flex w-[180px] flex-none flex-col gap-2 rounded-[20px] border border-line bg-tile-2 p-3.5"
            >
              <span className="flex items-center justify-between">
                <span className="num text-[18px]">{m.year}</span>
                <Chip g={m.g} tone={m.tone} size="sm" />
              </span>
              <span>
                <span className="block font-semibold">{m.title}</span>
                <span className="block text-[12px] text-ink-3">{m.sub}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PersonSheet({ person, onClose }: { person: SuperAccount | "new" | null; onClose: () => void }) {
  return (
    <Sheet
      open={person != null}
      onClose={onClose}
      title={person === "new" ? "Add someone's super" : person ? `${person.person}'s super` : ""}
    >
      {person != null && (
        <PersonForm key={person === "new" ? "new" : person.id} p={person === "new" ? null : person} onClose={onClose} />
      )}
    </Sheet>
  );
}

function PersonForm({ p, onClose }: { p: SuperAccount | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(p?.person ?? "");
  const [born, setBorn] = useState(p ? String(p.born) : "");
  const [fund, setFund] = useState(p?.fund ?? "");
  const [balance, setBalance] = useState(p ? (p.balance / 100).toFixed(0) : "");
  const [salary, setSalary] = useState(p ? (p.salary / 100).toFixed(0) : "");
  const [rate, setRate] = useState(p ? String(Math.round(p.rate * 1000) / 10) : "12");
  const save = useMutation({
    mutationFn: () =>
      apiSend(p ? "PUT" : "POST", p ? `retirement/people/${p.id}` : "retirement/people", {
        person: name,
        born: Number(born),
        fund,
        balance: parseMoney(balance) ?? 0,
        salary: parseMoney(salary) ?? 0,
        rate: Number(rate) / 100,
        as_of: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `retirement/people/${p!.id}`),
    onSuccess: () => {
      refresh(qc);
      onClose();
    },
  });
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Name</span>
          <Input value={name} placeholder="Alex" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Born (year)</span>
          <Input
            inputMode="numeric"
            value={born}
            placeholder="1988"
            onChange={(e) => setBorn(e.target.value.replace(/\D/g, ""))}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Fund</span>
        <Input value={fund} placeholder="AustralianSuper · Balanced" onChange={(e) => setFund(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Balance now $</span>
        <Input inputMode="decimal" value={balance} placeholder="112,600" onChange={(e) => setBalance(e.target.value)} />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Salary a year $</span>
          <Input inputMode="decimal" value={salary} placeholder="120,000" onChange={(e) => setSalary(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow">Employer %</span>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
      </div>
      {p && (
        <Link
          to="/settings"
          search={{ section: "retirement" }}
          onClick={onClose}
          className="text-[13px] font-semibold text-teal no-underline"
        >
          Fees and how it's invested are in Settings → Retirement
        </Link>
      )}
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex gap-2">
        {p && (
          <Button type="button" className="text-bad" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" disabled={!name.trim() || born.length !== 4 || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
