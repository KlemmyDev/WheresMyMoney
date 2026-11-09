/**
 * Early retirement: Set your goal (the uplift canvas's FiSetup). Four questions, most already answered from the
 * accounts: how much a year once stopped, what each person earns, anything out of date, then the freedom date.
 * The dates update as you answer (POST /api/fire/goal); Save my goal keeps the spending and any balances fixed.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { FireSummary } from "~/features/fire/api";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE, Stat } from "~/features/common/ds";
import { money, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, investmentsQuery, refresh, retirementQuery } from "~/features/common/queries";
import { Button, Empty, Input, Label, PageHead, Pill } from "~/features/common/ui";

type Goal = {
  spend: number;
  essentials: number;
  today: FireSummary | null;
  plan: FireSummary | null;
  lean: FireSummary | null;
  lasts: number | null;
};

const STEPS = ["How much a year", "What you each earn", "Anything we don't know", "Your freedom date"];
const SPEND = [
  [5500000, "Essentials only", "Home, food, bills, health"],
  [7000000, "Comfortable", "A bit under now"],
  [8000000, "Suggested", "A little more than now"],
  [10000000, "Generous", "More travel, more help for family"],
] as const;
const PAY = { weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly" } as const;
const age = (s: FireSummary | null) => (s ? String(s.retire_age) : "70+");

export function FireSetup() {
  const qc = useQueryClient();
  const toast = useToast();
  const ret = useQuery(retirementQuery);
  const inv = useQuery(investmentsQuery);
  const acc = useQuery(accountsQuery);
  const [step, setStep] = useState(0);
  const [spend, setSpend] = useState<number | null>(null);
  const [own, setOwn] = useState("");
  const [supers, setSupers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    document.title = "Set your goal · Early retirement · WheresMyMoney";
  }, []);
  const r = ret.data;
  const people = r?.people ?? [];
  const goalSpend = spend ?? r?.settings.spending ?? 8000000;
  const fixes: Record<string, number> = {};
  for (const p of people) {
    const v = supers[p.person];
    const c = v == null ? null : parseMoney(v);
    if (c != null && c !== p.balance) fixes[p.person] = c;
  }
  const q = useQuery({
    queryKey: ["fire", "goal", goalSpend, fixes],
    queryFn: () => apiSend<Goal>("POST", "fire/goal", { spend: goalSpend, supers: fixes }),
    placeholderData: keepPreviousData,
    enabled: people.length > 0,
  });
  const save = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      await apiSend("PUT", "retirement/settings", { spending: goalSpend });
      for (const p of people)
        if (fixes[p.person] != null)
          await apiSend("PUT", `retirement/people/${p.id}`, { balance: fixes[p.person], as_of: today });
    },
    onSuccess: () => {
      const was = { spending: r?.settings.spending, people: people.map((p) => [p.id, p.balance, p.as_of] as const) };
      refresh(qc);
      setSaved(true);
      toast("Goal saved", () =>
        apiSend("PUT", "retirement/settings", { spending: was.spending })
          .then(() =>
            Promise.all(
              was.people.map(([id, balance, as_of]) => apiSend("PUT", `retirement/people/${id}`, { balance, as_of })),
            ),
          )
          .then(() => {
            refresh(qc);
            setSaved(false);
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });

  if (!r) return <Loading />;
  if (people.length === 0)
    return (
      <>
        <PageHead over="Future · Early retirement" title="Set your goal" />
        <FireNav />
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          Each person&apos;s super balance, salary and the year they were born. The rest comes from your accounts.
        </Empty>
      </>
    );
  const g = q.data;
  const etfs = (inv.data?.funds ?? [])
    .filter((f) => f.kind !== "crypto" || r.settings.count_crypto)
    .reduce((t, f) => t + f.value, 0);
  const loan = acc.data?.loan ?? null;
  const offsetting = acc.data?.offsetting ?? 0;
  const lead = people[0];
  const go = (n: number) => {
    setStep(n);
    setSaved(false);
  };
  const width = (a: FireSummary | null) => `${(((a?.retire_age ?? 70) - lead.age) / (70 - lead.age)) * 100}%`;
  const gain = g?.today && g.plan ? g.today.retire_age - g.plan.retire_age : 0;

  return (
    <>
      <PageHead over="Future · Early retirement" title="Set your goal" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Four questions, most of them already answered from your accounts.
      </p>
      <FireNav />

      <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <ChoiceChip pressed={step === i} onClick={() => go(i)} aria-current={step === i ? "step" : undefined}>
              {i + 1}. {label}
            </ChoiceChip>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card lit tint="accent" aria-labelledby="fset-step" className="flex flex-col gap-4 md:col-span-8">
          <span className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
            Step {step + 1} of 4{step === 3 ? " · Your freedom date" : ""}
          </span>

          {step === 0 && (
            <>
              <CardHead id="fset-step" title="How much a year once you stop?" />
              <p className="m-0 text-[15px] text-ink-2">
                You spend about <b className="text-ink">{money(r.spending_now)}</b> a year now
                {loan ? ", plus the loan" : ""}. Most people want a little more once work stops, so we suggest{" "}
                {money(8000000)}.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SPEND.map(([v, label, sub]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={goalSpend === v}
                    onClick={() => {
                      setSpend(v);
                      setOwn("");
                    }}
                    className={`flex cursor-pointer flex-col items-start gap-0.5 rounded-2xl border p-3 text-left ${
                      goalSpend === v ? "border-accent bg-accent/10" : "border-line-2 bg-transparent"
                    }`}
                  >
                    <span className="text-[13px] text-ink-3">{label}</span>
                    <span className="num text-[18px] font-semibold text-ink">{money(v)}</span>
                    <span className="text-[12px] text-ink-3">{sub}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fset-own">Or type your own, a year</Label>
                <Input
                  id="fset-own"
                  inputMode="decimal"
                  placeholder="$"
                  value={own}
                  onChange={(e) => {
                    setOwn(e.target.value);
                    const c = parseMoney(e.target.value);
                    if (c != null && c >= 2000000 && c <= 30000000) setSpend(Math.round(c / 100000) * 100000);
                  }}
                  className="max-w-[220px]"
                />
              </div>
              {g && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold">What it&apos;s made of</span>
                  <div
                    className="flex h-3 overflow-hidden rounded-full"
                    role="img"
                    aria-label={`Essentials ${money(g.essentials)}, extras ${money(g.spend - g.essentials)}`}
                  >
                    <i style={{ width: `${(g.essentials / g.spend) * 100}%`, background: ROLE.savings }} />
                    <i className="flex-1" style={{ background: ROLE.spending }} />
                  </div>
                  <span className="text-[12px] text-ink-3">
                    Essentials {money(g.essentials)}: home, food, bills, health. Extras {money(g.spend - g.essentials)}:
                    travel, eating out, gifts. Essentials set your Lean goal.
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button primary onClick={() => go(1)}>
                  Next
                </Button>
                <span className="text-[12px] text-ink-3">You can change this any time.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <CardHead
                id="fset-step"
                title="What you each earn"
                right={
                  <Link to="/settings" search={{ section: "household" }} className="text-[13px] text-teal">
                    Change
                  </Link>
                }
              />
              <p className="m-0 text-[14px] text-ink-2">
                From Settings › Household. The plan uses these for tax, employer super and how much room the caps leave.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {people.map((p) => (
                  <Stat
                    key={p.id}
                    label={p.person}
                    value={money(p.salary)}
                    note={`Before tax · paid ${PAY[p.pay_every] ?? "fortnightly"} · employer super ${Math.round(p.rate * 100)}%${
                      p.sacrifice ? ` · sacrificing ${money(p.sacrifice)} a year` : " · no salary sacrifice"
                    }`}
                    role="accent"
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button primary onClick={() => go(2)}>
                  Next
                </Button>
                <Button onClick={() => go(0)}>Back</Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <CardHead id="fset-step" title="Anything we don't know?" />
              <p className="m-0 text-[14px] text-ink-2">
                We filled these in from your accounts and super statements. Fix anything that&apos;s out of date.
              </p>
              {people.map((p) => (
                <div key={p.id} className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                  <span>
                    <b className="block text-[14px]">
                      {p.person}, {p.age}
                    </b>
                    <span className="block text-[12px] text-ink-3">
                      Super opens at {r.preservation}, in {p.opens}
                    </span>
                  </span>
                  <span className="flex flex-col gap-1">
                    <Label htmlFor={`fset-sup-${p.id}`}>
                      {p.person}&apos;s super{p.fund ? `, ${p.fund}` : ""}
                    </Label>
                    <Input
                      id={`fset-sup-${p.id}`}
                      inputMode="decimal"
                      value={supers[p.person] ?? (p.balance / 100).toFixed(0)}
                      onChange={(e) => setSupers((s) => ({ ...s, [p.person]: e.target.value }))}
                      className="num w-[180px]"
                    />
                  </span>
                </div>
              ))}
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Stat label="ETFs outside super" value={money(etfs)} note="From Investments" role="invest" />
                <Stat
                  label="Accounts offsetting the loan"
                  value={money(offsetting)}
                  note="From Accounts · reachable any time"
                  role="offset"
                />
                {loan && (
                  <Stat
                    label="Home loan"
                    value={money(loan.balance)}
                    note={`From Loan and offset${loan.repayment ? ` · ${money(loan.repayment)} a month` : ""}`}
                    role="offset"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button primary onClick={() => go(3)}>
                  See your date
                </Button>
                <Button onClick={() => go(1)}>Back</Button>
              </div>
            </>
          )}

          {step === 3 && g && (
            <>
              <CardHead
                id="fset-step"
                title={g.plan ? `${g.plan.retire_age}, in ${g.plan.retire_year}` : "Not by 70"}
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Stat
                  label="As things are"
                  value={g.today ? `${g.today.retire_age}, in ${g.today.retire_year}` : "Not by 70"}
                  role="accent"
                />
                <Stat
                  label="With the loan money kept working"
                  value={g.plan ? `${g.plan.retire_age}, in ${g.plan.retire_year}` : "Not by 70"}
                  note={g.lasts ? `lasts to ${Math.min(g.lasts, 100)}` : ""}
                  role="savings"
                />
              </div>
              {loan && (
                <p className="m-0 text-[14px] text-ink-2">
                  <b className="text-ink">Biggest lever: keep investing the loan money once it&apos;s gone.</b> What the
                  loan frees, half to ETFs and half to super.{" "}
                  {gain > 0 ? `${gain} year${gain > 1 ? "s" : ""} sooner.` : "The same date either way."}
                </p>
              )}
              {saved ? (
                <div className="flex flex-col gap-2" role="status">
                  <Pill tone="good">Saved. Freedom now starts from here.</Pill>
                  <span className="text-[13px] text-ink-3">
                    To count the loan money, tap Make it the plan on Freedom.
                  </span>
                  <Link to="/early-retirement" className="text-[14px] font-semibold text-teal">
                    Go to Freedom
                  </Link>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button primary disabled={save.isPending} onClick={() => save.mutate()}>
                    Save my goal
                  </Button>
                  <Button onClick={() => go(2)}>Back</Button>
                </div>
              )}
            </>
          )}
        </Card>

        <Card aria-labelledby="fset-live" className="flex flex-col gap-3 md:col-span-4">
          <CardHead id="fset-live" title="As you answer" />
          {g && (
            <>
              <div>
                <span className="num block text-[40px] leading-none font-semibold text-savings">{age(g.plan)}</span>
                <span className="text-[13px] text-ink-3">
                  earliest stop{g.plan ? `, in ${g.plan.retire_year}` : ""}, with the loan money kept working
                </span>
              </div>
              {(
                [
                  ["As things are", g.today, ROLE.accent, false],
                  ["Loan money kept", g.plan, ROLE.savings, false],
                  ["Essentials only", g.lean, ROLE.savings, true],
                ] as const
              ).map(([label, s, colour, lean]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="flex justify-between text-[13px]">
                    <span>{label}</span>
                    <b className="num">{age(s)}</b>
                  </span>
                  <span className="block h-2 rounded-full bg-line">
                    <i
                      className={`block h-full rounded-full ${lean ? "striped" : ""}`}
                      style={{ width: width(s), background: colour }}
                    />
                  </span>
                </div>
              ))}
              <p className="m-0 text-[12px] text-ink-3">
                Bars run from today ({lead.age}) to each stop age. Striped is the Lean goal: essentials only,{" "}
                {money(g.essentials)} a year.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Spending" value={money(g.spend)} note="a year, today's dollars" role="accent" />
                <Stat
                  label="Super, all"
                  value={money(people.reduce((t, p) => t + (fixes[p.person] ?? p.balance), 0))}
                  role="savings"
                />
              </div>
            </>
          )}
        </Card>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. They rest on a few guesses:{" "}
        <Link to="/early-retirement/assumptions" className="text-teal">
          see the assumptions
        </Link>
        .
      </p>
    </>
  );
}
