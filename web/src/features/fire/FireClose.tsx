/**
 * Early retirement: Close the gap (the FIRE on track canvas's flow). Pick one change that gets the goal working on
 * its own (from the engine's closers), try how much, then the steps to set it up outside the app, then make it the
 * plan. Making it the plan never moves money: extra a month is kept with the plan (PUT /api/fire/extras), spending
 * and the age go to the goal (PUT /api/fire/goal), keeping the loan money working saves the plan (POST /api/fire/plan).
 * Each has an undo.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FlowHead, Option, StepNav } from "~/features/fire/flow";
import type { Closer, Track, TrackLevers, TrackReady } from "~/features/fire/api";
import { COLOUR, Status, TONE, k, statusOf, useTrack, verdictOf } from "~/features/fire/track";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import { Empty, ErrorText, SuccessTick } from "~/features/common/ui";

const STEPS = ["Choose", "How much", "Set it up"];

type Kind = Closer["key"];

export function FireClose() {
  const q = useTrack();
  // The flow works from the plan as it was when it opened, so making the change doesn't swap the page from under it.
  const [first, setFirst] = useState<Track | null>(null);
  if (q.data && !first) setFirst(q.data);
  if (q.isError && !first) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!first) return <Loading />;
  const t = first;
  if (!t.ready)
    return (
      <>
        <FlowHead over="Early retirement" title="Close the gap" steps={[]} step={0} />
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {t.needs}
        </Empty>
      </>
    );
  if (t.at_goal.ok)
    return (
      <>
        <FlowHead over={`Early retirement · goal: stop at ${t.goal.age}`} title="Close the gap" steps={[]} step={0} />
        <Card className="max-w-[760px] items-start gap-3 p-7">
          <SuccessTick size={52} />
          <h2 className="m-0 text-[26px] leading-8 font-semibold">There&apos;s no gap to close</h2>
          <p className="m-0 text-ink-2">{verdictOf(t).sentence}</p>
          <Link to="/early-retirement" className="text-[14px] font-semibold text-teal no-underline">
            Back to the plan →
          </Link>
        </Card>
      </>
    );
  return <Close start={t} />;
}

const META: Record<
  Kind,
  { name: string; colour: string; badge: string; tone: "good" | "warn" | "bad" | null; why: (t: TrackReady) => string }
> = {
  super: {
    name: "Salary sacrifice into super",
    colour: COLOUR.super,
    badge: "Cheapest",
    tone: "good",
    why: (t) =>
      `Goes in before tax, so each dollar costs about ${Math.round(t.take_home * 100)}c of take-home. Locked until ${t.opens}.`,
  },
  etfs: {
    name: "Invest more outside super",
    colour: COLOUR.outside,
    badge: "Flexible",
    tone: null,
    why: (t) => `Costs more after tax, but you can reach it any time, so it also covers the years before ${t.opens}.`,
  },
  keep: {
    name: "Keep the loan money working",
    colour: COLOUR.loan,
    badge: "No cost now",
    tone: "good",
    why: () => "Once the loan's gone, its repayments go into investments instead of everyday spending.",
  },
  spend: {
    name: "Plan to spend less",
    colour: TONE.warn,
    badge: "No cost now",
    tone: "warn",
    why: () => "Nothing changes today. You live on a little less once you've stopped.",
  },
  later: {
    name: "Stop a little later",
    colour: "var(--color-ink-2)",
    badge: "More years of work",
    tone: null,
    why: () => "Each extra year adds a year of saving and takes a year off what you need.",
  },
};

function Close({ start }: { start: TrackReady }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lead = start.people[0];
  const [step, setStep] = useState(0);
  const [key, setKey] = useState<Kind>(start.closers[0]?.key ?? "later");
  const [amount, setAmount] = useState<number | null>(null);
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  const [made, setMade] = useState(false);
  const closer = start.closers.find((c) => c.key === key) ?? start.closers[0];
  const lv = start.levers;
  const target = !closer
    ? 0
    : closer.key === "spend"
      ? closer.plan.spend * 100
      : closer.key === "later"
        ? closer.plan.goal
        : closer.key === "keep"
          ? 1
          : closer.amount;
  const value = amount ?? target;
  const patch: Partial<TrackLevers> =
    key === "super"
      ? { extra_super: lv.extra_super + value }
      : key === "etfs"
        ? { extra_etfs: lv.extra_etfs + value }
        : key === "keep"
          ? { keep: true }
          : key === "spend"
            ? { spend: value }
            : { goal: value };
  const tried = useTrack(step > 0 ? patch : undefined);
  const after = tried.data && tried.data.ready && step > 0 ? tried.data : start;
  const bv = verdictOf(start);
  const av = verdictOf(after);
  const show = (kk: Kind, v: number) =>
    kk === "spend"
      ? `${money(v)}/yr`
      : kk === "later"
        ? `at ${v}`
        : kk === "keep"
          ? `from ${start.loan?.gone_year ?? ""}`
          : `+${money(v)}/mo`;
  const perPay = (monthly: number) => money((monthly * 12) / 26 / Math.max(start.people.length, 1));
  const costs: [string, string][] =
    key === "super"
      ? [
          ["Into super a month", money(value)],
          ["Less take-home a month", money(value * start.take_home)],
          ["Each pay, each of you (fortnightly)", perPay(value)],
          ["Tax saved a year", money(value * 12 * Math.max(1 - start.take_home - 0.15, 0))],
        ]
      : key === "etfs"
        ? [
            ["A month", money(value)],
            ["Each fortnightly payday", money((value * 12) / 26)],
            ["A year", money(value * 12)],
          ]
        : key === "spend"
          ? [
              ["Spending a year", money(value)],
              ["Less than the goal", `${money(start.goal.spend - value)}/yr`],
              ["A month once stopped", money(value / 12)],
            ]
          : key === "later"
            ? [
                ["Stop in", String(start.goal.year + (value - start.goal.age))],
                ["Extra years working", String(value - start.goal.age)],
              ]
            : [
                ["Loan gone in", String(start.loan?.gone_year ?? "—")],
                ["Into investments a month from then", money(start.loan?.repayment ?? 0)],
              ];
  const how: [string, string][] =
    key === "super"
      ? [
          ...start.people.map(
            (p) =>
              [
                `${p.name}: ask payroll for salary sacrifice`,
                `${perPay(value)} a pay into super, before tax. Most employers have a form in the HR portal.`,
              ] as [string, string],
          ),
          [
            "Check the yearly cap",
            `${money(start.cap)} each, including the employer's money. ${start.people.map((p) => `${p.name}: ${money(p.employer + p.sacrifice + (value * 12) / start.people.length)}`).join(", ")}.`,
          ],
          ["We'll look for it at the next check-in", "The checkpoint compares what landed in super with this plan."],
        ]
      : key === "etfs"
        ? [
            [
              "Add a payday rule in your bank",
              `Move ${money((value * 12) / 26)} to your investing account every payday.`,
            ],
            ["Buy each month or quarter", "Same fund split as now. Fewer, bigger buys keep brokerage down."],
            ["Counted at check-ins", "Imported trades update the outside-super balance."],
          ]
        : key === "keep"
          ? [
              [
                "When the loan's gone, keep paying yourself",
                `From ${start.loan?.gone_year ?? "then"}, point its ${money(start.loan?.repayment ?? 0)} a month at investments. The plan counts on it.`,
              ],
            ]
          : key === "spend"
            ? [
                [
                  "The goal's spending becomes " + money(value),
                  "No money moves. The checkpoints are redrawn against it.",
                ],
              ]
            : [
                [
                  `The goal becomes stopping at ${value}`,
                  `In ${start.goal.year + (value - start.goal.age)}. The checkpoints are redrawn against it.`,
                ],
              ];

  const make = useMutation({
    mutationFn: async () => {
      if (key === "super" || key === "etfs")
        return apiSend<{ was: Record<string, number> }>("PUT", "fire/extras", patch);
      if (key === "keep") return apiSend("POST", "fire/plan");
      return apiSend("PUT", "fire/goal", key === "spend" ? { spend: value } : { age: value });
    },
    onSuccess: (r) => {
      refresh(qc);
      setMade(true);
      const undo = () => {
        if (key === "super" || key === "etfs") {
          const was = (r as { was: Record<string, number> }).was;
          return apiSend("PUT", "fire/extras", {
            extra_super: was.extra_super ?? 0,
            extra_etfs: was.extra_etfs ?? 0,
            extra_loan: was.extra_loan ?? 0,
          });
        }
        if (key === "keep") return apiSend("DELETE", "fire/plan");
        return apiSend("PUT", "fire/goal", key === "spend" ? { spend: start.goal.spend } : { age: start.goal.age });
      };
      toast("It's part of the plan now", () =>
        undo()
          .then(() => {
            refresh(qc);
            setMade(false);
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });

  if (made) {
    return (
      <>
        <FlowHead
          over={`Early retirement · goal: stop at ${after.goal.age}`}
          title="Close the gap"
          steps={STEPS}
          step={3}
        />
        <Card className="max-w-[900px] gap-5 p-8">
          <SuccessTick size={56} />
          <div>
            <div className="text-[12px] text-ink-3">
              Now part of the plan · {META[key].name} {show(key, value)}
            </div>
            <h2
              className="mt-1 mb-0 font-brand text-[38px] leading-[44px] font-semibold tracking-[-0.02em]"
              style={{ color: TONE[av.tone] }}
            >
              {av.title}
            </h2>
            <p className="mt-2 mb-0 text-ink-2">{av.sentence}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Home loan", COLOUR.loan, after.parts.loan],
                ["Outside super", COLOUR.outside, after.parts.outside],
                ["Super", COLOUR.super, after.parts.super],
              ] as const
            ).map(([name, colour, part]) => (
              <div key={name} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-sunken p-3.5">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-[3px]" style={{ background: colour }} />
                  <span className="font-semibold">{name}</span>
                </div>
                <span className="self-start">
                  <Status tone={statusOf(part).tone}>{statusOf(part).label}</Status>
                </span>
              </div>
            ))}
          </div>
          <p className="m-0 text-[14px] text-ink-2">The next checkpoint will show whether it&apos;s happening.</p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/early-retirement"
              className="btn-primary inline-flex min-h-11 items-center rounded-xl px-5 font-semibold no-underline"
            >
              Back to the plan
            </Link>
            <Link
              to="/early-retirement/checkpoints"
              className="press inline-flex min-h-11 items-center rounded-xl border border-line-2 px-5 font-semibold text-ink no-underline"
            >
              See the checkpoints
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const range =
    key === "spend"
      ? { min: Math.max(2_000_000, start.goal.spend - 4_000_000), max: start.goal.spend, step: 100_000 }
      : key === "later"
        ? { min: start.goal.age, max: Math.min(70, start.goal.age + 8), step: 1 }
        : { min: 0, max: Math.max(200_000, target * 2), step: 5_000 };
  const strip = (tt: TrackReady) => {
    const L = (age: number) => Math.max(0, Math.min(100, ((age - lead.age) / (tt.goal.plan_to - lead.age)) * 100));
    return { work: L(tt.goal.age), out: tt.at_goal.lasts < tt.goal.plan_to ? L(tt.at_goal.lasts) : 100 };
  };
  return (
    <>
      <FlowHead
        over={`Early retirement · goal: stop at ${start.goal.age}`}
        title="Close the gap"
        steps={STEPS}
        step={step}
      />
      {step === 0 && (
        <>
          <div>
            <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">
              You&apos;re {bv.title}. Pick one way to catch up.
            </h2>
            <p className="mt-1.5 mb-0 max-w-[720px] text-ink-2">
              Each of these on its own gets you to {start.goal.age}. The cost is what it takes from you now.
            </p>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {start.closers.map((c) => {
              const m = META[c.key];
              const tv = c.key === "spend" ? c.plan.spend * 100 : c.key === "later" ? c.plan.goal : c.amount;
              const cost =
                c.key === "super"
                  ? `${money(c.amount * start.take_home)}/mo take-home`
                  : c.key === "etfs"
                    ? `${money(c.amount)}/mo take-home`
                    : c.key === "later"
                      ? `${c.amount} more years`
                      : "Nothing now";
              return (
                <Option
                  key={c.key}
                  on={key === c.key}
                  onClick={() => {
                    setKey(c.key);
                    setAmount(null);
                  }}
                  className="gap-2.5 p-4"
                >
                  <span className="flex w-full items-center gap-2.5">
                    <span className="h-8 w-2.5 flex-none rounded-md" style={{ background: m.colour }} />
                    <span className="flex-1 text-[16px] font-semibold">{m.name}</span>
                    {m.tone ? (
                      <Status tone={m.tone}>{m.badge}</Status>
                    ) : (
                      <span className="rounded-full bg-raised px-2.5 py-[3px] text-xs font-semibold text-ink-2">
                        {m.badge}
                      </span>
                    )}
                  </span>
                  <span className="num text-[24px] leading-[30px]">{show(c.key, tv)}</span>
                  <span className="flex w-full justify-between gap-2 text-[13px]">
                    <span className="text-ink-2">Costs you now</span>
                    <span className="num">{cost}</span>
                  </span>
                  <span className="text-[13px] leading-[18px] text-ink-2">{m.why(start)}</span>
                </Option>
              );
            })}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div>
            <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">
              {META[key].name}
              {key === "keep" ? "" : ": how much?"}
            </h2>
            <p className="mt-1.5 mb-0 text-ink-2">
              {key === "keep"
                ? "Nothing to choose: this is what it does."
                : `Drag to see the trade. ${show(key, target)} gets you all the way; less still helps.`}
            </p>
          </div>
          <div className="flex flex-wrap items-stretch gap-5">
            <Card className="min-w-0 flex-[999_1_560px] gap-5">
              {key !== "keep" && (
                <label className="flex flex-col gap-1.5">
                  <span className="flex justify-between gap-2">
                    <span className="text-ink-2">
                      {key === "spend"
                        ? "Spending each year once stopped"
                        : key === "later"
                          ? `Stop work when ${lead.name} is`
                          : "Extra each month"}
                    </span>
                    <span className="num text-[20px] font-semibold">{show(key, value)}</span>
                  </span>
                  <input
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={value}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="h-7 w-full accent-[var(--color-teal)]"
                  />
                </label>
              )}
              {(
                [
                  ["Today's plan", start, bv],
                  ["With this change", after, av],
                ] as const
              ).map(([label, tt, vv]) => {
                const s = strip(tt);
                return (
                  <div key={label}>
                    <div className="mb-1.5 flex justify-between text-[13px]">
                      <span className="text-ink-2">{label}</span>
                      <span className="font-semibold" style={{ color: TONE[vv.tone] }}>
                        {vv.title}
                      </span>
                    </div>
                    <div className="relative h-[18px] overflow-hidden rounded-lg border border-line bg-sunken">
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: `${s.work}%`,
                          background: `color-mix(in srgb, ${COLOUR.super} 30%, transparent)`,
                        }}
                      />
                      <div
                        className="absolute inset-y-0 right-0"
                        style={{
                          left: `${s.out}%`,
                          background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${TONE.bad} 55%, transparent) 0 5px, color-mix(in srgb, ${TONE.bad} 10%, transparent) 5px 10px)`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mono flex justify-between text-[11px] text-ink-3">
                <span>
                  {lead.age} · {start.years[0].year}
                </span>
                <span>{start.opens}</span>
                <span>
                  {start.goal.plan_to} · {start.goal.year + (start.goal.plan_to - start.goal.age)}
                </span>
              </div>
            </Card>
            <Card className="min-w-0 flex-[1_1_300px] gap-2">
              <h3 className="m-0 text-[18px] leading-6 font-semibold">What it costs</h3>
              <dl className="m-0">
                {costs.map(([kk, vv]) => (
                  <div key={kk} className="flex justify-between gap-3 border-b border-line py-2.5 text-[14px]">
                    <dt className="text-ink-2">{kk}</dt>
                    <dd className="num m-0 text-right font-semibold">{vv}</dd>
                  </div>
                ))}
              </dl>
              <p className="m-0 text-[13px] text-ink-2">
                {after.at_goal.ok
                  ? "That's enough on its own."
                  : "Not quite enough on its own. Push a little further, or add another change later."}
              </p>
            </Card>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <div>
            <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">Here&apos;s how to set it up</h2>
            <p className="mt-1.5 mb-0 max-w-[720px] text-ink-2">
              The app can&apos;t move money, so these are the steps outside it. Tick them off as you go; you can make it
              the plan now and finish later.
            </p>
          </div>
          <Card className="max-w-[820px] gap-2.5">
            {how.map(([title, detail], i) => (
              <label
                key={title}
                className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-line bg-sunken p-3.5"
              >
                <input
                  type="checkbox"
                  checked={!!ticks[i]}
                  onChange={() => setTicks({ ...ticks, [i]: !ticks[i] })}
                  className="mt-0.5 size-[22px] flex-none accent-[var(--color-teal)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{title}</span>
                  <span className="text-[14px] leading-5 text-ink-2">{detail}</span>
                </span>
              </label>
            ))}
          </Card>
        </>
      )}
      {make.isError && <ErrorText>{errorMessage(make.error)}</ErrorText>}
      <StepNav
        back={step > 0 ? () => setStep(step - 1) : undefined}
        next={() => (step < 2 ? setStep(step + 1) : make.mutate())}
        nextLabel={step === 2 ? "Make it the plan" : "Next"}
        busy={make.isPending}
      />
      <p className="m-0 text-[13px] text-ink-3">
        Today: {k(start.parts.super.have + start.parts.outside.have)} put away,{" "}
        {k(start.parts.super.need + start.parts.outside.need)} needed. An estimate, not advice.
      </p>
    </>
  );
}
