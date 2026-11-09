/**
 * Early retirement: Assumptions (the uplift canvas's NwAssumptions). The few guesses every freedom date rests on:
 * super's return before fees, the super fee (each fund's own, or one set here), inflation and the age to plan to.
 * Change one and the dates move; save when they look right. One set of guesses for every page.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type FireSummary } from "~/features/fire/api";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, Stat } from "~/features/common/ds";
import { pct } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, retirementQuery } from "~/features/common/queries";
import { Button, PageHead, Pill } from "~/features/common/ui";

type Guess = { super_return: number; super_fee: number | null; inflation: number; plan_to: number };
type Assumed = {
  real_growth: number;
  today: FireSummary | null;
  plan: FireSummary | null;
  fee_from: string;
  funds_fee: number;
};

const CARDS: {
  key: keyof Guess;
  name: string;
  step: number;
  min: number;
  max: number;
  show: (v: number) => string;
  why: string;
}[] = [
  {
    key: "super_return",
    name: "Super's return, before fees",
    step: 0.0025,
    min: 0.03,
    max: 0.12,
    show: (v) => pct(v, 2),
    why: "A balanced option over the long run. Errs a little low.",
  },
  {
    key: "super_fee",
    name: "Super fees",
    step: 0.0005,
    min: 0,
    max: 0.02,
    show: (v) => pct(v, 2),
    why: "Each fund's own fees, weighted by balance, unless you set one here.",
  },
  {
    key: "inflation",
    name: "Inflation",
    step: 0.0025,
    min: 0.01,
    max: 0.06,
    show: (v) => pct(v, 2),
    why: "Everything is in today's dollars; this is what turns returns into real growth.",
  },
  {
    key: "plan_to",
    name: "Plan to age",
    step: 1,
    min: 80,
    max: 105,
    show: (v) => String(v),
    why: "How long the money should last. 92 errs long.",
  },
];

export function FireAssumptions() {
  const qc = useQueryClient();
  const toast = useToast();
  const ret = useQuery(retirementQuery);
  const fire = useQuery(fireQuery);
  const [g, setG] = useState<Guess | null>(null);
  useEffect(() => {
    document.title = "Assumptions · Early retirement · WheresMyMoney";
  }, []);
  const s = ret.data?.settings;
  const saved: Guess | null = s
    ? { super_return: s.super_return, super_fee: s.super_fee ?? null, inflation: s.inflation, plan_to: s.plan_to }
    : null;
  const cur = g ?? saved;
  const q = useQuery({
    queryKey: ["fire", "assume", cur],
    queryFn: () => apiSend<Assumed>("POST", "fire/assume", cur!),
    placeholderData: keepPreviousData,
    enabled: !!cur,
  });
  const save = useMutation({
    mutationFn: () => apiSend("PUT", "retirement/settings", cur),
    onSuccess: () => {
      const was = saved;
      refresh(qc);
      setG(null);
      toast("Assumptions saved", () =>
        apiSend("PUT", "retirement/settings", was)
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  if (!cur || !fire.data) return <Loading />;
  const d = q.data;
  const fundsFee = d?.funds_fee ?? 0.006;
  const value = (k: keyof Guess) => (k === "super_fee" ? (cur.super_fee ?? fundsFee) : (cur[k] as number));
  const changed = !!g && JSON.stringify(g) !== JSON.stringify(saved);

  return (
    <>
      <PageHead over="Future · Early retirement" title="Assumptions" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        The few guesses every freedom date rests on. Change one and watch the dates move; save when they look right.
      </p>
      <FireNav />

      <Card lit tint="accent" aria-labelledby="fa-hero" className="flex flex-col gap-3">
        <CardHead
          id="fa-hero"
          title="With these assumptions"
          right={changed ? <Pill tone="warn">Not saved yet</Pill> : <Pill tone="good">Saved</Pill>}
        />
        {d && (
          <>
            <p className="m-0 text-[16px] text-ink">
              Growth after fees and inflation comes to <b>{pct(d.real_growth, 1)}</b> a year. Each guess errs a little
              low on purpose, so a good decade is a bonus, not the plan.
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Stat
                label="Today's plan"
                value={d.today ? `${d.today.retire_age} · ${d.today.retire_year}` : "Not by 70"}
                note={d.today ? `lasts to ${d.today.lasts}` : ""}
                role="accent"
              />
              <Stat
                label="With the plan"
                value={d.plan ? `${d.plan.retire_age} · ${d.plan.retire_year}` : "Not by 70"}
                note={d.plan ? `lasts to ${d.plan.lasts}` : ""}
                role="accent"
              />
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button primary disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            Save these
          </Button>
          {changed && <Button onClick={() => setG(null)}>Put back</Button>}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        {CARDS.map((c) => {
          const v = value(c.key);
          const set = (nv: number) =>
            setG({ ...cur, [c.key]: Math.round(Math.min(c.max, Math.max(c.min, nv)) * 100000) / 100000 });
          return (
            <Card key={c.key} aria-label={c.name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{c.name}</span>
                <span className="flex items-center gap-2">
                  <Button small aria-label={`Lower ${c.name}`} onClick={() => set(v - c.step)}>
                    −
                  </Button>
                  <span className="num w-16 text-center text-[18px]">{c.show(v)}</span>
                  <Button small aria-label={`Raise ${c.name}`} onClick={() => set(v + c.step)}>
                    +
                  </Button>
                </span>
              </div>
              <p className="m-0 text-[13px] text-ink-3">{c.why}</p>
              {c.key === "super_fee" && (
                <p className="m-0 text-[12px] text-ink-2">
                  {cur.super_fee == null
                    ? `Using your funds' own: about ${pct(fundsFee, 2)} at today's balances.`
                    : `Set here; your funds' own come to about ${pct(fundsFee, 2)}. `}
                  {cur.super_fee != null && (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-teal"
                      onClick={() => setG({ ...cur, super_fee: null })}
                    >
                      Use the funds&apos; own
                    </button>
                  )}
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        One set of guesses for every page, so the dates always agree. Tax and super rules:{" "}
        {fire.data.ready
          ? `${fire.data.assumptions.rules_year - 1}–${String(fire.data.assumptions.rules_year).slice(2)}`
          : "this year"}
        .
      </p>
    </>
  );
}
