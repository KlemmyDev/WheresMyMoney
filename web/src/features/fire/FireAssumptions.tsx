/**
 * Early retirement: Assumptions (the uplift canvas's NwAssumptions). The few guesses every freedom date rests on:
 * super's return before fees, the super fee (each fund's own, or one set here), inflation and the age to plan to.
 * Change one and the dates move; save when they look right. One set of guesses for every page. Above them, how sure
 * the date is (how far each guess moves it, GET /api/fire/sensitivity), and below, where each "need" comes from.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type FireSummary } from "~/features/fire/api";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, Stat } from "~/features/common/ds";
import { pct } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, retirementQuery } from "~/features/common/queries";
import { Button, PageHead, Pill } from "~/features/common/ui";
import { COLOUR, TONE, k, useTrack } from "~/features/fire/track";

type Sensitivity = {
  earliest: number | null;
  rows: { key: string; name: string; what: string; better: number | null; worse: number | null }[];
};

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
  const sens = useQuery({
    queryKey: ["fire", "sensitivity"],
    queryFn: ({ signal }) => apiGet<Sensitivity>("fire/sensitivity", undefined, { signal }),
  });
  const track = useTrack();
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

      {sens.data && <HowSure s={sens.data} />}

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
      {track.data && track.data.ready && <WhereNeed t={track.data} />}
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

/** How far each guess moves the earliest age to stop, better (green, left) and worse (amber, right), biggest first. */
function HowSure({ s }: { s: Sensitivity }) {
  const centre = s.earliest ?? 70;
  const all = s.rows.flatMap((r) => [r.better ?? 45, r.worse ?? 71]).concat(centre);
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const X = (a: number) => ((a - lo) / (hi - lo)) * 100;
  const rows = [...s.rows].sort((a, b) => (b.worse ?? 71) - (b.better ?? 45) - ((a.worse ?? 71) - (a.better ?? 45)));
  const biggest = rows[0];
  const ages = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((a) => a % 2 === 0);
  return (
    <Card aria-labelledby="fa-sure" className="gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="fa-sure" className="m-0 text-[20px] leading-7 font-semibold">
          How sure is &quot;stop at {centre}&quot;?
        </h2>
        <span className="text-[12px] text-ink-3">Each bar: change one guess, everything else as it is</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[minmax(130px,240px)_minmax(0,1fr)] gap-4">
          <span />
          <div className="relative h-4">
            {ages.map((a) => (
              <span
                key={a}
                className="mono absolute -translate-x-1/2 text-[11px]"
                style={{ left: `${X(a)}%`, color: a === centre ? "var(--color-ink)" : "var(--color-ink-3)" }}
              >
                {a}
              </span>
            ))}
          </div>
        </div>
        {rows.map((r) => {
          const good = Math.min(r.better ?? 45, centre);
          const bad = Math.max(r.worse ?? 71, centre);
          return (
            <div key={r.key} className="grid grid-cols-[minmax(130px,240px)_minmax(0,1fr)] items-center gap-4">
              <div>
                <div className="text-[14px] font-semibold">{r.name}</div>
                <div className="text-[12px] text-ink-3">{r.what}</div>
              </div>
              <div
                className="relative h-[30px] rounded-lg border border-line bg-sunken"
                role="img"
                aria-label={`${r.name}: ${r.what} moves the earliest stop to ${r.better ?? "before 45"} or ${r.worse ?? "after 70"}`}
              >
                <div
                  className="absolute inset-y-1 rounded-l-md"
                  style={{
                    left: `${X(good)}%`,
                    width: `${X(centre) - X(good)}%`,
                    background: `color-mix(in srgb, ${TONE.good} 55%, transparent)`,
                  }}
                />
                <div
                  className="absolute inset-y-1 rounded-r-md"
                  style={{
                    left: `${X(centre)}%`,
                    width: `${X(bad) - X(centre)}%`,
                    background: `color-mix(in srgb, ${TONE.warn} 60%, transparent)`,
                  }}
                />
                <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${X(centre)}%` }} />
                {good < centre && (
                  <span
                    className="mono absolute top-1.5 -translate-x-[115%] text-[12px] text-good"
                    style={{ left: `${X(good)}%` }}
                  >
                    {r.better ?? "<45"}
                  </span>
                )}
                {bad > centre && (
                  <span
                    className="mono absolute top-1.5 translate-x-[15%] text-[12px] text-warn"
                    style={{ left: `${X(bad)}%` }}
                  >
                    {r.worse ?? "70+"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {biggest && (
        <p className="m-0 text-[14px] leading-5 text-ink-2">
          {biggest.name} matter most: {biggest.what.split(" / ")[1] ?? "worse"} moves the date to{" "}
          {biggest.worse ?? "after 70"}. That&apos;s why the plan checks in every year instead of trusting one forecast.
        </p>
      )}
    </Card>
  );
}

/** Where the needs come from: worked back from the end, so every year has a number to be at. */
function WhereNeed({ t }: { t: import("~/features/fire/api").TrackReady }) {
  const lead = t.people[0];
  const goalI = Math.min(t.goal.age - lead.age, t.years.length - 1);
  const opensI = Math.min(t.opens - lead.age, t.years.length - 1);
  const steps: [string, string, React.ReactNode][] = [
    [
      COLOUR.super,
      `Super at ${t.opens}`,
      <>
        Enough to pay {k(t.goal.spend)} every year from {t.opens} to {t.goal.plan_to}, growing as it&apos;s spent,
        ending at $0: <b className="num text-ink">{k(t.years[opensI].super_need)}</b>.
      </>,
    ],
    [
      COLOUR.outside,
      "Outside super when you stop",
      t.goal.age < t.opens ? (
        <>
          Enough for the {t.opens - t.goal.age} years from stopping to {t.opens}:{" "}
          <b className="num text-ink">{k(t.years[goalI].outside_need)}</b> by {t.goal.year}.
        </>
      ) : (
        <>Nothing: super opens the year you stop.</>
      ),
    ],
    [
      COLOUR.loan,
      "Back to today",
      <>
        Take off what today&apos;s savings will add and the growth on the way. What&apos;s left is where each part has
        to be now: super <b className="num text-ink">{k(t.parts.super.need)}</b>, outside{" "}
        <b className="num text-ink">{k(t.parts.outside.need)}</b>. The loan: the most today&apos;s repayments clear by{" "}
        {t.goal.year}, <b className="num text-ink">{k(t.parts.loan.need)}</b>.
      </>,
    ],
  ];
  return (
    <Card aria-labelledby="fa-need" className="gap-4">
      <h2 id="fa-need" className="m-0 text-[20px] leading-7 font-semibold">
        Where &quot;need&quot; comes from
      </h2>
      <p className="m-0 text-[14px] text-ink-2">
        We start at the end and walk backwards, so every year has a number it needs to be at.
      </p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map(([colour, title, body], i) => (
          <li key={title} className="flex items-start gap-3.5">
            <span
              className="num inline-flex size-8 flex-none items-center justify-center rounded-[10px] font-semibold"
              style={{ color: colour, background: `color-mix(in srgb, ${colour} 20%, transparent)` }}
            >
              {i + 1}
            </span>
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-[14px] leading-5 text-ink-2">{body}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] text-ink-3">
        Outside super&apos;s savings beyond the bridge carry on into the super years, so they come off super&apos;s
        need: the two together decide whether the goal works.
      </p>
    </Card>
  );
}
