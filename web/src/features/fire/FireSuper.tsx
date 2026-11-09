/**
 * Early retirement: Super (the FIRE on track canvas's super sub page). Both funds together against the path super has
 * to follow (open at 60, last to the plan-to age), each person's contributions and the room under the yearly cap,
 * and salary sacrifice to try: what it costs in take-home pay and what it does to the date. From the engine
 * (GET/POST /api/fire/track); trying saves nothing.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { TrackReady } from "~/features/fire/api";
import { COLOUR, CompareChart, Status, TONE, k, statusOf, useScrub, useTrack } from "~/features/fire/track";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, Eyebrow } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { Empty, ErrorText, PageHead } from "~/features/common/ui";

export function FireSuper() {
  const [extra, setExtra] = useState(0);
  const base = useTrack();
  const tried = useTrack(extra > 0 ? { extra_super: extra } : undefined);
  const q = extra > 0 ? tried : base;
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data || !base.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Super" />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        Both funds together. Locked until each of you turns 60, then it has to last until the plan-to age.
      </p>
      <FireNav />
      {!t.ready || !base.data.ready ? (
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        >
          {t.ready ? "" : t.needs}
        </Empty>
      ) : (
        <Super t={t} base={base.data} extra={extra} setExtra={setExtra} />
      )}
    </>
  );
}

function Super({
  t,
  base,
  extra,
  setExtra,
}: {
  t: TrackReady;
  base: TrackReady;
  extra: number;
  setExtra: (v: number) => void;
}) {
  const lead = t.people[0];
  const n = t.years.length - 1;
  const opensI = Math.min(t.opens - lead.age, n);
  const goalI = Math.min(t.goal.age - lead.age, n);
  const { at, handlers } = useScrub(n, opensI);
  const p = t.parts.super;
  const s = statusOf(p);
  const y = t.years[at];
  const d = y.super - y.super_need;
  const outI = t.at_goal.lasts < t.goal.plan_to ? t.at_goal.lasts - lead.age : null;
  const marks = [
    { i: goalI, label: `Stop ${t.goal.age}`, colour: COLOUR.super },
    ...t.people.map((x) => ({
      i: Math.min(t.opens - x.age, n),
      label: `${x.name} ${t.opens}`,
      colour: TONE.good,
    })),
    ...(outI != null ? [{ i: outI, label: "Runs out", colour: TONE.bad }] : []),
  ];
  const short = t.at_goal.lasts < t.goal.plan_to;
  const covered = p.ahead < 0 && t.parts.outside.ahead >= -p.ahead;
  const mtr = 1 - t.take_home;
  const each = extra / t.people.length;
  return (
    <>
      <Card lit className="gap-6">
        <div className="flex flex-wrap items-stretch gap-6">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
            <span className="self-start">
              <Status tone={s.tone}>{s.label}</Status>
            </span>
            <h2 className="m-0 font-brand text-[34px] leading-10 font-semibold tracking-[-0.02em] sm:text-[40px] sm:leading-[46px]">
              {p.ahead >= 0 ? "Ahead of the path" : `${k(-p.ahead)} behind the path`}
            </h2>
            <p className="m-0 max-w-[540px] text-ink-2">
              On pace it reaches {k(t.years[opensI].super)} when {lead.name} turns {t.opens}
              {short ? `, and runs dry at ${t.at_goal.lasts}.` : ` and lasts past ${t.goal.plan_to}.`}
              {covered ? ` Outside super's spare ${k(t.parts.outside.ahead)} covers the difference.` : ""}
              {!covered && p.ahead < 0 ? " This is the part of the plan that's short." : ""}
            </p>
          </div>
          <div className="grid min-w-0 flex-[1_1_420px] grid-cols-3 gap-3">
            <Fig label="Need today" value={k(p.need)} />
            <Fig label="Have today" value={k(p.have)} colour={COLOUR.super} />
            <Fig label={`Need at ${t.opens} · ${t.years[opensI].year}`} value={k(t.years[opensI].super_need)} />
          </div>
        </div>
      </Card>
      <Card aria-labelledby="fs-path" className="gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="fs-path" className="m-0 text-[20px] leading-7 font-semibold">
              The path super has to follow
            </h2>
            <div className="text-[12px] text-ink-3">
              Dashed: needed · solid: on pace{extra > 0 ? " with the sacrifice (dotted: without)" : ""} · hover any year
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5" aria-live="polite">
            <div>
              <div className="text-[12px] text-ink-3">
                {y.year} · {lead.name} {y.age} · need
              </div>
              <div className="num text-[20px]">{money(y.super_need)}</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-3">On pace</div>
              <div className="num text-[20px]" style={{ color: COLOUR.super }}>
                {money(y.super)}
              </div>
            </div>
            <Status tone={y.short > 0 ? "bad" : d >= 0 ? "good" : "warn"}>
              {y.short > 0 ? "Spending not covered" : `${d >= 0 ? "Ahead" : "Behind"} ${k(Math.abs(d))}`}
            </Status>
          </div>
        </div>
        <CompareChart
          need={t.years.map((x) => x.super_need)}
          pace={t.years.map((x) => x.super)}
          ghost={extra > 0 ? base.years.map((x) => x.super) : undefined}
          end={n}
          years={t.years.map((x) => x.year)}
          colour={COLOUR.super}
          at={at}
          handlers={handlers}
          marks={marks}
          label="Super: pick a year"
          height={300}
        />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {t.people.map((x) => {
          const sac = x.sacrifice + each * 12;
          const used = x.employer + sac;
          const sgW = (x.employer / t.cap) * 100;
          const sacW = (Math.min(sac, Math.max(t.cap - x.employer, 0)) / t.cap) * 100;
          return (
            <Card as="article" key={x.name} className="gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-[14px] bg-teal/20 font-bold text-teal">
                  {x.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{x.name}</div>
                  <div className="text-[12px] text-ink-3">
                    {x.age} · {money(x.salary)} salary · opens {x.opens}
                  </div>
                </div>
                <div className="num text-[22px]">{money(x.super)}</div>
              </div>
              <dl className="m-0 text-[14px]">
                <Row label="Employer puts in" value={`${money(x.employer)}/yr`} />
                <Row label="Salary sacrifice" value={`${money(sac)}/yr`} />
                <Row label="Lands after the 15% going in" value={`${money(used * 0.85)}/yr`} />
              </dl>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-2">{money(t.cap)} yearly cap</span>
                  <span className="num">
                    {money(used)} used · {money(Math.max(0, t.cap - used))} left
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full border border-line bg-sunken" aria-hidden>
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${sgW}%`, background: COLOUR.super, opacity: 0.55 }}
                  />
                  <div
                    className="absolute inset-y-0"
                    style={{ left: `${sgW}%`, width: `${sacW}%`, background: COLOUR.super }}
                  />
                </div>
                {used > t.cap && (
                  <div className="text-[13px] text-warn">Over the cap: the extra would be taxed at your rate.</div>
                )}
              </div>
              {x.id != null && (
                <Link
                  to="/retirement/super/$personId"
                  params={{ personId: String(x.id) }}
                  className="text-[14px] font-semibold text-teal no-underline"
                >
                  {x.name}&apos;s super →
                </Link>
              )}
            </Card>
          );
        })}
      </div>
      <Card className="flex-row flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-3.5">
          <h2 className="m-0 text-[20px] leading-7 font-semibold">Try salary sacrifice</h2>
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between gap-2">
              <span className="text-[14px] text-ink-2">Extra into super each month, split between you</span>
              <span className="num font-semibold">{money(extra)}/mo</span>
            </span>
            <input
              type="range"
              min={0}
              max={250_000}
              step={5_000}
              value={extra}
              onChange={(e) => setExtra(Number(e.target.value))}
              className="h-7 w-full accent-[var(--color-teal)]"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Fig label="Take-home cost" value={`${money(extra * t.take_home)}/mo`} />
            <Fig label="Tax saved a year" value={money(extra * 12 * Math.max(mtr - 0.15, 0))} colour={TONE.good} />
            <Fig
              label="Earliest stop"
              value={t.pace ? `${lead.name} ${t.pace.retire_age}` : "After 70"}
              colour={t.pace && t.pace.retire_age <= t.goal.age ? TONE.good : TONE.warn}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-[18px] border border-line bg-sunken p-4">
          <div className="font-semibold">{p.ahead < 0 ? "Why super is the short one" : "Why super matters"}</div>
          <p className="m-0 text-[14px] leading-5 text-ink-2">
            Stopping at {t.goal.age} means {Math.max(0, t.opens - t.goal.age)} years with no employer money going in,
            and super then has to pay for {t.goal.plan_to - t.opens} years. A dollar sacrificed goes in before tax (15%
            instead of {Math.round(mtr * 100)}%), so it moves the date more than a dollar anywhere else, as long as the
            years before {t.opens} are covered.
          </p>
        </div>
      </Card>
      <p className="m-0 text-[13px] text-ink-3">
        Super grows {(t.assumptions.real_growth * 100).toFixed(1)}% a year after fees and inflation.{" "}
        <Link to="/early-retirement/assumptions" className="text-teal">
          Change the assumptions
        </Link>
        . Caps and tax rates for this financial year. An estimate, not advice.
      </p>
    </>
  );
}

function Fig({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="num mt-1 text-[20px] leading-[26px]" style={colour ? { color: colour } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="num m-0">{value}</dd>
    </div>
  );
}
