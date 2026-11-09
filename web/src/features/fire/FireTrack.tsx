/**
 * Early retirement: Are we on track? (the FIRE on track canvas's hub). The goal against today's pace in one line;
 * Alex's life as a strip; where the loan, outside super and super each need to be today; every year's money
 * against what's needed; and levers to try, with the smallest change that would close the gap. Every figure comes
 * from the engine (GET/POST /api/fire/track); trying levers saves nothing.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { Closer, TrackLevers, TrackReady } from "~/features/fire/api";
import {
  COLOUR,
  LifeTimeline,
  PartSpark,
  Status,
  TONE,
  YearChart,
  k,
  series,
  statusOf,
  useScrub,
  useTrack,
  verdictOf,
  type Tone,
} from "~/features/fire/track";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, Eyebrow } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone as ChipTone } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import { Button, Empty, ErrorText, PageHead, Switch, cn } from "~/features/common/ui";

const QUIET =
  "press inline-flex min-h-11 items-center rounded-xl border border-line bg-tile-2 px-4 text-[14px] font-semibold text-ink no-underline hover:border-line-2";

export function FireTrack() {
  const [levers, setLevers] = useState<Partial<TrackLevers>>({});
  const q = useTrack(levers);
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead
        over="Future · Early retirement"
        title="Are we on track?"
        actions={
          t.ready ? (
            <>
              <Link to="/early-retirement/setup" className={QUIET}>
                {t.goal.set ? "Edit goal" : "Set the goal"}
              </Link>
              <Link to="/early-retirement/checkpoints" className={QUIET}>
                Checkpoints
              </Link>
              <Link
                to="/early-retirement/checkin"
                className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-[14px] font-semibold no-underline"
              >
                Check in
              </Link>
            </>
          ) : undefined
        }
      />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        Three things have to line up: the loan gone, enough outside super to get to 60, and enough super to last. Each
        has a number it needs to be at today.
      </p>
      <FireNav />
      {!t.ready ? (
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
      ) : (
        <Hub
          t={t}
          levers={levers}
          setLevers={setLevers}
          trying={Object.keys(levers).length > 0}
          busy={q.isFetching}
          error={q.isError ? errorMessage(q.error) : null}
        />
      )}
    </>
  );
}

function Hub({
  t,
  levers,
  setLevers,
  trying,
  busy,
  error,
}: {
  t: TrackReady;
  levers: Partial<TrackLevers>;
  setLevers: (l: Partial<TrackLevers>) => void;
  trying: boolean;
  busy: boolean;
  error: string | null;
}) {
  const v = verdictOf(t);
  const p = t.parts;
  const need = p.super.need + p.outside.need;
  const have = p.super.have + p.outside.have;
  const gap = have - need;
  return (
    <>
      {!t.goal.set && !trying ? (
        <NoGoal t={t} />
      ) : (
        <Verdict t={t} v={v} need={need} have={have} gap={gap} trying={trying} />
      )}
      <section aria-labelledby="ft-today" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ft-today" className="m-0 text-[20px] leading-7 font-semibold">
            Where we need to be today
          </h2>
          <span className="text-[12px] text-ink-3">
            Dashed: the path that gets you there · solid: where today&apos;s pace goes
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <LoanCard t={t} />
          <OutsideCard t={t} />
          <SuperCard t={t} />
        </div>
      </section>
      <YearByYear t={t} />
      <Levers t={t} levers={levers} setLevers={setLevers} trying={trying} busy={busy} error={error} />
      <p className="m-0 max-w-[820px] text-[13px] text-ink-3">
        All in today&apos;s dollars. Growth {(t.assumptions.real_growth * 100).toFixed(1)}% a year after fees and
        inflation. Outside super pays first, then super once each of you turns {t.opens}. The age pension isn&apos;t
        counted. An estimate to plan with, not advice.{" "}
        <Link to="/early-retirement/assumptions" className="text-teal">
          How it&apos;s worked out
        </Link>
      </p>
    </>
  );
}

function NoGoal({ t }: { t: TrackReady }) {
  return (
    <Card className="flex flex-wrap items-center gap-6 border-dashed border-line-2 p-7">
      <div className="flex min-w-[280px] flex-[1_1_420px] flex-col gap-2.5">
        <div className="font-brand text-[30px] leading-9 font-semibold tracking-[-0.02em] sm:text-[36px] sm:leading-[42px]">
          When do you want to stop work?
        </div>
        <p className="m-0 max-w-[560px] text-ink-2">
          Pick an age and what a year should cost. We&apos;ll work out where the loan, your investments and super need
          to be every year to get there, and tell you if you&apos;re on track.
        </p>
        <div className="mt-1">
          <Link
            to="/early-retirement/setup"
            className="btn-primary inline-flex min-h-11 items-center rounded-xl px-5 font-semibold no-underline"
          >
            Set the goal
          </Link>
        </div>
      </div>
      <div className="flex min-w-[260px] flex-[1_1_320px] items-center justify-between gap-3 rounded-2xl border border-line bg-sunken p-4">
        <div>
          <div className="font-semibold">Earliest on today&apos;s pace</div>
          <div className="text-[13px] text-ink-3">
            On {money(t.goal.spend)} a year, to {t.goal.plan_to}
          </div>
        </div>
        <div className="num text-[26px]">{t.pace ? `${t.people[0].name} ${t.pace.retire_age}` : "After 70"}</div>
      </div>
    </Card>
  );
}

function Verdict({
  t,
  v,
  need,
  have,
  gap,
  trying,
}: {
  t: TrackReady;
  v: ReturnType<typeof verdictOf>;
  need: number;
  have: number;
  gap: number;
  trying: boolean;
}) {
  return (
    <Card lit aria-labelledby="ft-verdict" className="gap-6">
      <div className="flex flex-wrap items-start gap-8">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Status tone={v.tone}>{v.pill}</Status>
            {trying && <span className="text-[12px] text-ink-3">Trying levers, nothing saved</span>}
          </div>
          <h2
            id="ft-verdict"
            className="m-0 font-brand text-[38px] leading-[44px] font-semibold tracking-[-0.03em] sm:text-[48px] sm:leading-[54px]"
            style={{ color: TONE[v.tone] }}
          >
            {v.title}
          </h2>
          <p className="m-0 max-w-[620px] text-[17px] leading-[26px] text-ink-2">{v.sentence}</p>
        </div>
        <div className="grid min-w-0 flex-[0_1_420px] grid-cols-3 gap-3">
          <Fig label="Need today" value={k(need)} note="super + outside" />
          <Fig label="Have today" value={k(have)} note="super + outside" />
          <Fig
            label={gap >= 0 ? "Ahead by" : "Short by"}
            value={`${gap >= 0 ? "+" : "−"}${k(Math.abs(gap))}`}
            note="loan aside"
            tone={gap >= 0 ? "good" : "warn"}
          />
        </div>
      </div>
      <LifeTimeline t={t} />
    </Card>
  );
}

function Fig({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken p-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div
        className="num mt-1 text-[22px] leading-7 sm:text-[24px] sm:leading-[30px]"
        style={tone ? { color: TONE[tone] } : undefined}
      >
        {value}
      </div>
      {note && <div className="text-[12px] text-ink-3">{note}</div>}
    </div>
  );
}

function PartCard({
  glyph,
  tone,
  title,
  sub,
  status,
  needLabel,
  haveLabel,
  need,
  have,
  colour,
  spark,
  note,
  to,
  link,
}: {
  glyph: Glyph;
  tone: ChipTone;
  title: string;
  sub: string;
  status: { label: string; tone: Tone } | null;
  needLabel: string;
  haveLabel: string;
  need: number;
  have: number;
  colour: string;
  spark: ReactNode;
  note: ReactNode;
  to: "/early-retirement/debt" | "/early-retirement/bridge" | "/early-retirement/super";
  link: string;
}) {
  const mx = Math.max(need, have, 1) * 1.15;
  return (
    <Card as="article" className="gap-3.5">
      <div className="flex items-center gap-3">
        <Chip g={glyph} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-[12px] text-ink-3">{sub}</div>
        </div>
        {status && <Status tone={status.tone}>{status.label}</Status>}
      </div>
      <div className="flex gap-5">
        <div>
          <Eyebrow>{needLabel}</Eyebrow>
          <div className="num text-[22px] leading-7">{k(need)}</div>
        </div>
        <div>
          <Eyebrow>{haveLabel}</Eyebrow>
          <div className="num text-[22px] leading-7" style={{ color: colour }}>
            {k(have)}
          </div>
        </div>
      </div>
      <div className="relative h-3 rounded-full border border-line bg-sunken" aria-hidden>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(have / mx) * 100}%`, background: colour }}
        />
        <div
          className="absolute -inset-y-1.5 w-[3px] -translate-x-1/2 rounded-sm bg-ink"
          style={{ left: `${(need / mx) * 100}%` }}
        />
      </div>
      {spark}
      <p className="m-0 text-[14px] leading-5 text-ink-2">{note}</p>
      <Link to={to} className="mt-auto text-[14px] font-semibold text-teal no-underline">
        {link} →
      </Link>
    </Card>
  );
}

function LoanCard({ t }: { t: TrackReady }) {
  const p = t.parts.loan;
  const s = series(t.years);
  const goalI = t.goal.age - t.people[0].age;
  const gone = t.loan?.gone_year ?? null;
  if (!t.loan || p.have <= 0) {
    return (
      <Card as="article" className="gap-3">
        <div className="flex items-center gap-3">
          <Chip g={I.loan} tone="offset" />
          <div className="font-semibold">Home loan</div>
          <span className="ml-auto">
            <Status tone="good">Nothing owed</Status>
          </span>
        </div>
        <p className="m-0 text-[14px] text-ink-2">No loan past the offset, so nothing to clear before you stop.</p>
      </Card>
    );
  }
  const end = Math.max(goalI, gone ? gone - t.years[0].year + 1 : goalI);
  return (
    <PartCard
      glyph={I.loan}
      tone="offset"
      title="Home loan"
      sub="Gone before you stop"
      status={statusOf(p)}
      needLabel="Owe at most"
      haveLabel="Owe now"
      need={p.need}
      have={p.have}
      colour={COLOUR.loan}
      spark={
        <PartSpark
          need={s.loanNeed.map((x) => x ?? 0)}
          pace={s.loanPace}
          end={end}
          colour={COLOUR.loan}
          ahead={p.ahead >= 0}
          label="Loan owing on schedule against the most you can owe each year"
        />
      }
      note={
        gone == null
          ? "On today's repayments it isn't gone by 70."
          : gone < t.goal.year
            ? `On schedule it's gone in ${gone}, ${t.goal.year - gone} years before you stop. Extra repayments aren't needed for this goal.`
            : gone === t.goal.year
              ? `Gone in ${gone}, the year you stop. No room to spare.`
              : `On schedule it's gone in ${gone}, ${gone - t.goal.year} years after you stop: repayments would come out of retirement money.`
      }
      to="/early-retirement/debt"
      link="Loan details"
    />
  );
}

function OutsideCard({ t }: { t: TrackReady }) {
  const p = t.parts.outside;
  const s = series(t.years);
  const opensI = t.opens - t.people[0].age;
  const goalI = t.goal.age - t.people[0].age;
  const atGoal = t.years[Math.min(goalI, t.years.length - 1)];
  return (
    <PartCard
      glyph={I.invest}
      tone="invest"
      title="Outside super"
      sub={`The bridge to ${t.opens}`}
      status={t.goal.age >= t.opens ? null : statusOf(p)}
      needLabel="Need now"
      haveLabel="Have now"
      need={p.need}
      have={p.have}
      colour={COLOUR.outside}
      spark={
        <PartSpark
          need={s.outNeed}
          pace={s.outPace}
          end={opensI}
          colour={COLOUR.outside}
          ahead={p.ahead >= 0}
          label="Outside super on today's pace against the path it needs"
        />
      }
      note={
        t.goal.age < t.opens
          ? `Needs ${k(atGoal.outside_need)} by ${t.goal.year} to pay ${t.opens - t.goal.age} years until super opens. On pace: ${k(atGoal.etfs)}.`
          : `Stopping at ${t.opens} or later, super pays from day one.`
      }
      to="/early-retirement/bridge"
      link="Outside super details"
    />
  );
}

function SuperCard({ t }: { t: TrackReady }) {
  const p = t.parts.super;
  const s = series(t.years);
  const opensI = Math.min(t.opens - t.people[0].age, t.years.length - 1);
  const at = t.years[opensI];
  return (
    <PartCard
      glyph={I.retire}
      tone="savings"
      title="Super"
      sub={`Lasts from ${t.opens} to ${t.goal.plan_to}`}
      status={statusOf(p)}
      needLabel="Need now"
      haveLabel="Have now"
      need={p.need}
      have={p.have}
      colour={COLOUR.super}
      spark={
        <PartSpark
          need={s.superNeed}
          pace={s.superPace}
          end={t.years.length - 1}
          colour={COLOUR.super}
          ahead={p.ahead >= 0}
          label="Super on today's pace against the path it needs"
        />
      }
      note={
        `Needs ${k(at.super_need)} when ${t.people[0].name} turns ${t.opens} (${at.year}) to last to ${t.goal.plan_to}. On pace: ${k(at.super)}.` +
        (p.ahead < 0 && t.parts.outside.ahead >= -p.ahead
          ? ` Outside super's spare ${k(t.parts.outside.ahead)} covers the difference.`
          : "")
      }
      to="/early-retirement/super"
      link="Super details"
    />
  );
}

function YearByYear({ t }: { t: TrackReady }) {
  const n = t.years.length - 1;
  const goalI = Math.min(t.goal.age - t.people[0].age, n);
  const { at, handlers } = useScrub(n, goalI);
  const y = t.years[at];
  const total = y.super + y.etfs;
  const needed = y.super_need + y.outside_need;
  const d = total - needed;
  const phase = y.age < t.goal.age ? "Working" : y.age < t.opens ? "Living on outside super" : "Living on super";
  const others = t.people.slice(1).map((p) => `${p.name} ${p.age + (y.age - t.people[0].age)}`);
  const tone: Tone = y.short > 0 ? "bad" : d >= 0 ? "good" : "warn";
  return (
    <Card aria-labelledby="ft-years" className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="ft-years" className="m-0 text-[20px] leading-7 font-semibold">
            Year by year, if you stop at {t.goal.age}
          </h2>
          <div className="text-[12px] text-ink-3">Today&apos;s dollars · hover, drag or use the arrow keys</div>
        </div>
        <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
          <Key colour={COLOUR.super}>Super</Key>
          <Key colour={COLOUR.outside}>Outside super</Key>
          {t.loan && <Key colour={COLOUR.loan}>Loan owing</Key>}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-ink" />
            Needed
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-5">
        <div className="min-w-0 flex-[999_1_600px]">
          <YearChart t={t} at={at} handlers={handlers} label="Pick a year" />
        </div>
        <aside
          className="flex flex-[1_1_240px] flex-col gap-3 rounded-[18px] border border-line bg-sunken p-4"
          aria-live="polite"
        >
          <div>
            <div className="num text-[24px] leading-[30px]">{y.year}</div>
            <div className="text-[12px] text-ink-3">
              {[`${t.people[0].name} ${y.age}`, ...others, phase].join(" · ")}
            </div>
          </div>
          <span className="self-start">
            <Status tone={tone}>
              {y.short > 0 ? `Short ${money(y.short)} this year` : `${d >= 0 ? "Ahead" : "Behind"} ${k(Math.abs(d))}`}
            </Status>
          </span>
          <dl className="m-0 flex flex-col gap-2 text-[14px]">
            <Line label="Super" value={money(y.super)} colour={COLOUR.super} />
            <Line label="Outside super" value={money(y.etfs)} colour={COLOUR.outside} />
            {t.loan && <Line label="Loan owing" value={y.owed > 0 ? money(y.owed) : "Gone"} colour={COLOUR.loan} />}
            <div className="h-px bg-line" />
            <Line label="On pace" value={money(total)} />
            <Line label="Needed" value={money(needed)} />
          </dl>
          <p className="m-0 text-[13px] text-ink-3">
            {y.short > 0
              ? "Spending isn't covered this year."
              : d >= 0
                ? "More than this year's checkpoint."
                : "Under this year's checkpoint: the dashed line is where the plan needs you."}
          </p>
        </aside>
      </div>
    </Card>
  );
}

function Key({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-[3px]" style={{ background: colour }} />
      {children}
    </span>
  );
}

function Line({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className="num m-0" style={colour ? { color: colour } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function Levers({
  t,
  levers,
  setLevers,
  trying,
  busy,
  error,
}: {
  t: TrackReady;
  levers: Partial<TrackLevers>;
  setLevers: (l: Partial<TrackLevers>) => void;
  trying: boolean;
  busy: boolean;
  error: string | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const lv = t.levers;
  const set = (patch: Partial<TrackLevers>) => setLevers({ ...levers, ...patch });
  const keep = useMutation({
    mutationFn: () => apiSend("POST", "fire/plan"),
    onSuccess: () => {
      refresh(qc);
      setLevers({ ...levers, keep: undefined });
      toast("It's the plan now: the loan money keeps working once it's gone", () =>
        apiSend("DELETE", "fire/plan")
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const ideas = t.closers.map((c) => closerText(c, t));
  return (
    <section className="flex flex-wrap items-stretch gap-4" aria-label="Try it">
      <Card className="min-w-0 flex-[999_1_560px] gap-5">
        <div>
          <h2 className="m-0 text-[20px] leading-7 font-semibold">Try it</h2>
          <div className="text-[12px] text-ink-3">
            Everything on this page moves as you drag. Nothing is saved.{busy ? " Working it out…" : ""}
          </div>
        </div>
        <div className="grid gap-x-7 gap-y-5 sm:grid-cols-2">
          <Slider
            label={`Stop work when ${t.people[0].name} is`}
            value={lv.goal}
            shown={String(lv.goal)}
            min={Math.max(45, t.people[0].age + 1)}
            max={65}
            step={1}
            onChange={(v) => set({ goal: v })}
          />
          <Slider
            label="Spend each year once stopped"
            value={lv.spend / 100}
            shown={money(lv.spend)}
            min={40000}
            max={150000}
            step={1000}
            onChange={(v) => set({ spend: v * 100 })}
          />
          <Slider
            label="Extra into super a month (salary sacrifice)"
            value={lv.extra_super / 100}
            shown={`${money(lv.extra_super)}/mo`}
            min={0}
            max={3000}
            step={50}
            onChange={(v) => set({ extra_super: v * 100 })}
          />
          <Slider
            label="Extra into investments outside super a month"
            value={lv.extra_etfs / 100}
            shown={`${money(lv.extra_etfs)}/mo`}
            min={0}
            max={3000}
            step={50}
            onChange={(v) => set({ extra_etfs: v * 100 })}
          />
        </div>
        {t.loan && (
          <div className="flex min-h-11 items-center gap-3">
            <Switch checked={lv.keep} onChange={(on) => set({ keep: on })} label="Keep the loan money working" />
            <span className="text-[14px] text-ink-2">
              Once the loan&apos;s gone{t.loan.gone_year ? ` in ${t.loan.gone_year}` : ""}, keep putting its repayments
              into investments
            </span>
          </div>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        {trying && (
          <div>
            <Button onClick={() => setLevers({})}>Back to today&apos;s plan</Button>
          </div>
        )}
      </Card>
      <Card className="min-w-0 flex-[1_1_340px] gap-3">
        <h2 className="m-0 text-[20px] leading-7 font-semibold">
          {t.at_goal.ok ? "You're on track" : "What closes the gap"}
        </h2>
        <div className="text-[12px] text-ink-3">
          {t.at_goal.ok
            ? "Nothing more is needed for this goal."
            : `Any one of these on its own gets you to ${t.goal.age}`}
        </div>
        {!t.at_goal.ok && !trying && (
          <Link
            to="/early-retirement/close"
            className="btn-primary order-last inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[14px] font-semibold no-underline"
          >
            Make one of these the plan
          </Link>
        )}
        {ideas.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => (c.key === "keep" && !trying ? keep.mutate() : set(c.patch))}
            className="press flex min-h-11 cursor-pointer flex-col gap-1 rounded-2xl border border-line-2 bg-tile-2 px-4 py-3.5 text-left hover:border-teal"
          >
            <span className="flex w-full justify-between gap-2">
              <span className="font-semibold">{c.label}</span>
              <span className="num font-semibold" style={{ color: c.colour }}>
                {c.value}
              </span>
            </span>
            <span className="text-[13px] leading-[18px] text-ink-2">{c.detail}</span>
          </button>
        ))}
      </Card>
    </section>
  );
}

function closerText(
  c: Closer,
  t: TrackReady,
): { key: string; label: string; value: string; detail: string; colour: string; patch: Partial<TrackLevers> } {
  const lv = t.levers;
  switch (c.key) {
    case "super":
      return {
        key: c.key,
        label: "Salary sacrifice",
        value: `+${money(c.amount)}/mo`,
        detail: `Costs about ${money(c.amount * t.take_home)} a month take-home: it goes in before tax. Locked until ${t.opens}.`,
        colour: COLOUR.super,
        patch: { extra_super: lv.extra_super + c.amount },
      };
    case "etfs":
      return {
        key: c.key,
        label: "Invest outside super",
        value: `+${money(c.amount)}/mo`,
        detail: "After tax, but you can reach it before super opens.",
        colour: COLOUR.outside,
        patch: { extra_etfs: lv.extra_etfs + c.amount },
      };
    case "keep":
      return {
        key: c.key,
        label: "Keep the loan money working",
        value: t.loan?.gone_year ? `from ${t.loan.gone_year}` : "",
        detail:
          "Once the loan's gone, its repayments go into investments instead of everyday spending. Makes it the plan.",
        colour: COLOUR.loan,
        patch: { keep: true },
      };
    case "spend":
      return {
        key: c.key,
        label: "Spend less once stopped",
        value: `${money(c.plan.spend * 100)}/yr`,
        detail: `${money(c.amount)} a year less than the goal.`,
        colour: TONE.warn,
        patch: { spend: c.plan.spend * 100 },
      };
    case "later":
      return {
        key: c.key,
        label: "Stop a little later",
        value: `at ${c.plan.goal}`,
        detail: `In ${t.goal.year + c.amount}, with nothing else changed.`,
        colour: "var(--color-ink-2)",
        patch: { goal: c.plan.goal },
      };
  }
}

function Slider({
  label,
  value,
  shown,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  shown: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between gap-2">
        <span className="text-[14px] text-ink-2">{label}</span>
        <span className="num font-semibold">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("h-7 w-full accent-[var(--color-teal)]")}
      />
    </label>
  );
}
