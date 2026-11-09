/**
 * Early retirement: Set the goal (the FIRE on track canvas's goal flow). When to stop work and how long the money
 * should last; what a year of retirement costs; then what has to be true for each part of the plan, before saving.
 * A panel beside the questions shows ahead or behind as you choose (POST /api/fire/track, nothing saved until "Make
 * it our goal", PUT /api/fire/goal, which has an undo).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FlowHead, Option, StepNav } from "~/features/fire/flow";
import type { Track, TrackReady } from "~/features/fire/api";
import { COLOUR, LifeTimeline, Status, TONE, k, statusOf, useTrack, verdictOf } from "~/features/fire/track";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, retirementQuery } from "~/features/common/queries";
import { Empty, ErrorText, SuccessTick } from "~/features/common/ui";

const STEPS = ["When", "How much", "Check"];

export function FireSetup() {
  const first = useTrack();
  const ret = useQuery(retirementQuery);
  if (first.isError) return <ErrorText>{errorMessage(first.error)}</ErrorText>;
  if (!first.data || !ret.data) return <Loading />;
  if (!first.data.ready)
    return (
      <>
        <FlowHead over="Early retirement" title="Set the goal" steps={[]} step={0} />
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {first.data.needs}
        </Empty>
      </>
    );
  return <Setup start={first.data} spendingNow={ret.data.spending_now} />;
}

function Setup({ start, spendingNow }: { start: TrackReady; spendingNow: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const lead = start.people[0];
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(start.goal.age);
  const [planTo, setPlanTo] = useState(start.goal.plan_to);
  const [spend, setSpend] = useState(start.goal.spend);
  const [done, setDone] = useState<TrackReady | null>(null);
  const q = useTrack({ goal, spend, plan_to: planTo });
  const t = q.data && q.data.ready ? q.data : start;
  const v = verdictOf(t);
  const save = useMutation({
    mutationFn: () => apiSend<Track>("PUT", "fire/goal", { age: goal, spend, plan_to: planTo }),
    onSuccess: (r) => {
      const was = start.goal;
      refresh(qc);
      if (r.ready) setDone(r);
      toast("Goal saved", () =>
        apiSend("PUT", "fire/goal", { age: was.age, spend: was.spend, plan_to: was.plan_to })
          .then(() => {
            refresh(qc);
            setDone(null);
            setStep(2);
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const likeNow = Math.max(4_000_000, Math.round(spendingNow / 100_000) * 100_000);
  const presets = [
    { name: "Like now", value: likeNow, detail: "What you've spent in the last year, without the loan." },
    {
      name: "Comfortable",
      value: likeNow + 1_600_000,
      detail: "Like now, plus about $16,000 a year for travel and helping family.",
    },
    {
      name: "Generous",
      value: likeNow + 3_400_000,
      detail: "Bigger trips, a newer car every few years, more eating out.",
    },
  ];
  const ages = Array.from({ length: 13 }, (_, i) => 50 + i).filter((a) => a > lead.age);
  const others = start.people.slice(1);
  const goalI = Math.min(goal - lead.age, t.years.length - 1);
  const opensI = Math.min(t.opens - lead.age, t.years.length - 1);

  if (done) {
    const dv = verdictOf(done);
    return (
      <>
        <FlowHead over="Early retirement" title="Set the goal" steps={STEPS} step={3} />
        <Card className="max-w-[860px] items-start gap-4 p-8">
          <SuccessTick size={56} />
          <h2 className="m-0 text-[28px] leading-[34px] font-semibold">
            Goal saved: stop at {done.goal.age}, {money(done.goal.spend)} a year
          </h2>
          <p className="m-0 max-w-[600px] text-ink-2">{dv.sentence}</p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/early-retirement"
              className="btn-primary inline-flex min-h-11 items-center rounded-xl px-5 font-semibold no-underline"
            >
              See where we stand
            </Link>
            {!done.at_goal.ok && (
              <Link
                to="/early-retirement/close"
                className="press inline-flex min-h-11 items-center rounded-xl border border-line-2 px-5 font-semibold text-ink no-underline"
              >
                Close the gap
              </Link>
            )}
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <FlowHead over="Early retirement" title="Set the goal" steps={STEPS} step={step} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          {step === 0 && (
            <Card className="gap-5">
              <div>
                <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">
                  When do you want to stop work?
                </h2>
                <p className="mt-1.5 mb-0 text-ink-2">
                  {others.length
                    ? `You stop in the same year. Pick ${lead.name}'s age; ${others.map((o) => o.name).join(" and ")}'s follows.`
                    : "Pick the age you'd like to stop."}
                </p>
              </div>
              <div
                role="group"
                aria-label={`Stop when ${lead.name} is`}
                className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5"
              >
                {ages.map((a) => (
                  <Option key={a} on={a === goal} onClick={() => setGoal(a)}>
                    <span className="num text-[22px] leading-7 font-semibold">{a}</span>
                    <span className="text-[12px] leading-4 text-ink-2">
                      {[
                        ...others.map((o) => `${o.name} ${o.age + (a - lead.age)}`),
                        String(start.goal.year + (a - start.goal.age)),
                      ].join(" · ")}
                    </span>
                  </Option>
                ))}
              </div>
              <div className="h-px bg-line" />
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="font-semibold">How long should the money last?</div>
                  <div className="text-[14px] text-ink-2">Until {lead.name} is this age. Longer is safer.</div>
                </div>
                <div role="group" aria-label="Plan to" className="flex flex-wrap gap-2.5">
                  {(
                    [
                      [90, "a bit tighter"],
                      [92, "the usual"],
                      [95, "extra careful"],
                    ] as const
                  ).map(([a, sub]) => (
                    <Option key={a} on={a === planTo} onClick={() => setPlanTo(a)} className="min-w-[140px]">
                      <span>
                        <span className="num font-semibold">{a}</span>
                        <span className="text-[13px] text-ink-2"> · {sub}</span>
                      </span>
                    </Option>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {step === 1 && (
            <Card className="gap-5">
              <div>
                <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">
                  What will a year of retirement cost?
                </h2>
                <p className="mt-1.5 mb-0 text-ink-2">
                  In today&apos;s dollars, for the household. The loan will be gone, so leave its repayments out.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {presets.map((p) => (
                  <Option key={p.name} on={p.value === spend} onClick={() => setSpend(p.value)} className="p-4">
                    <span className="font-semibold">{p.name}</span>
                    <span className="num text-[24px] leading-[30px]">{money(p.value)}</span>
                    <span className="text-[13px] leading-[18px] text-ink-2">{p.detail}</span>
                  </Option>
                ))}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="flex flex-wrap justify-between gap-2">
                  <span className="text-[14px] text-ink-2">Or set your own</span>
                  <span className="num font-semibold">
                    {money(spend)} a year · {money(spend / 12)} a month
                  </span>
                </span>
                <input
                  type="range"
                  min={3_000_000}
                  max={20_000_000}
                  step={100_000}
                  value={spend}
                  onChange={(e) => setSpend(Number(e.target.value))}
                  className="h-7 w-full accent-[var(--color-teal)]"
                />
              </label>
              <div className="flex flex-wrap justify-between gap-2 rounded-2xl border border-line bg-sunken px-4 py-3.5 text-[14px]">
                <span>What you&apos;ve spent in the last year, without the loan or transfers</span>
                <span className="num font-semibold">{money(spendingNow)}</span>
              </div>
            </Card>
          )}
          {step === 2 && (
            <Card className="gap-5">
              <div>
                <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">
                  Here&apos;s where that leaves you
                </h2>
                <p className="mt-1.5 mb-0 text-ink-2">
                  Saving it doesn&apos;t move any money. It sets the checkpoints the app holds you to.
                </p>
              </div>
              <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Summary
                  label="Stop work"
                  value={`${lead.name} ${goal} · ${t.goal.year}`}
                  onChange={() => setStep(0)}
                />
                <Summary label="Spend a year" value={money(spend)} onChange={() => setStep(1)} />
                <Summary label="Last until" value={`${lead.name} ${planTo}`} onChange={() => setStep(0)} />
              </dl>
              <div className="flex flex-col gap-2.5">
                <div className="font-semibold">What has to be true</div>
                <Rule
                  colour={COLOUR.loan}
                  name={`Home loan gone by ${t.goal.year}`}
                  status={
                    t.loan && t.parts.loan.have > 0 ? statusOf(t.parts.loan) : { label: "Nothing owed", tone: "good" }
                  }
                >
                  {t.loan?.gone_year ? `On schedule it goes in ${t.loan.gone_year}. ` : ""}Owe at most{" "}
                  {k(t.parts.loan.need)} today.
                </Rule>
                <Rule
                  colour={COLOUR.outside}
                  name={`Outside super reaches ${k(t.years[goalI].outside_need)} by ${t.goal.year}`}
                  status={goal < t.opens ? statusOf(t.parts.outside) : { label: "Not needed", tone: "good" }}
                >
                  {goal < t.opens
                    ? `Pays for ${t.opens - goal} years until super opens. Need ${k(t.parts.outside.need)} today.`
                    : "Super opens the year you stop."}
                </Rule>
                <Rule
                  colour={COLOUR.super}
                  name={`Super reaches ${k(t.years[opensI].super_need)} when ${lead.name} turns ${t.opens}`}
                  status={statusOf(t.parts.super)}
                >
                  Lasts from {t.years[opensI].year} to {planTo}. Need {k(t.parts.super.need)} today.
                </Rule>
              </div>
            </Card>
          )}
          {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
          <StepNav
            back={step > 0 ? () => setStep(step - 1) : undefined}
            next={() => (step < 2 ? setStep(step + 1) : save.mutate())}
            nextLabel={step === 2 ? "Make it our goal" : "Next"}
            busy={save.isPending}
          />
        </div>
        <Card lit className="sticky top-6 min-w-0 flex-[1_1_320px] gap-3.5" aria-live="polite">
          <div className="text-[12px] text-ink-3">As you choose</div>
          <span className="self-start">
            <Status tone={v.tone}>{v.pill}</Status>
          </span>
          <div
            className="font-brand text-[32px] leading-[38px] font-semibold tracking-[-0.02em]"
            style={{ color: TONE[v.tone] }}
          >
            {v.title}
          </div>
          <p className="m-0 text-[14px] leading-5 text-ink-2">{v.sentence}</p>
          <LifeTimeline t={t} compact />
          <dl className="m-0 flex flex-col gap-2 text-[13px]">
            {goal < t.opens && (
              <Line label={`Outside super needed by ${t.goal.year}`} value={k(t.years[goalI].outside_need)} />
            )}
            <Line label={`Super needed at ${t.opens}`} value={k(t.years[opensI].super_need)} />
            <Line
              label="Earliest on today's pace"
              value={t.pace ? `${lead.name} ${t.pace.retire_age} · ${t.pace.retire_year}` : "After 70"}
            />
          </dl>
        </Card>
      </div>
    </>
  );
}

function Summary({ label, value, onChange }: { label: string; value: string; onChange: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken p-3.5">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="num m-0 mt-1 text-[18px]">{value}</dd>
      <dd className="m-0">
        <button
          type="button"
          onClick={onChange}
          className="min-h-8 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
        >
          Change
        </button>
      </dd>
    </div>
  );
}

function Rule({
  colour,
  name,
  status,
  children,
}: {
  colour: string;
  name: string;
  status: { label: string; tone: "good" | "warn" | "bad" };
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken px-3.5 py-3">
      <span className="h-9 w-2.5 flex-none rounded-md" style={{ background: colour }} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{name}</div>
        <div className="text-[13px] leading-[18px] text-ink-2">{children}</div>
      </div>
      <Status tone={status.tone}>{status.label}</Status>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="num m-0">{value}</dd>
    </div>
  );
}
