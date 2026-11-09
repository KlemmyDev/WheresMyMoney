/**
 * Early retirement: Checkpoints (the FIRE on track canvas's "Three checkpoints"). Each part of the plan against the
 * path it has to follow: the loan (owe at most), outside super (the bridge to 60) and super (to the plan-to age),
 * ahead tinted green and behind amber. Hovering one chart moves all three. Then the checkpoints to hit, year by year.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { TrackReady } from "~/features/fire/api";
import { COLOUR, CompareChart, Status, TONE, k, series, useScrub, useTrack, type Tone } from "~/features/fire/track";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { Empty, ErrorText, PageHead, cn } from "~/features/common/ui";

export function FireCheckpoints() {
  const [goal, setGoal] = useState<number | null>(null);
  const q = useTrack(goal != null ? { goal } : undefined);
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Checkpoints" />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        For each part of the plan: the path it has to follow (dashed) and where today&apos;s pace takes it (solid).
        Hover one chart and all three follow.
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
        <Checkpoints t={t} goal={goal} setGoal={setGoal} />
      )}
    </>
  );
}

function Checkpoints({
  t,
  goal,
  setGoal,
}: {
  t: TrackReady;
  goal: number | null;
  setGoal: (g: number | null) => void;
}) {
  const lead = t.people[0];
  const n = t.years.length - 1;
  const goalI = Math.min(t.goal.age - lead.age, n);
  const opensI = Math.min(t.opens - lead.age, n);
  const { at, handlers } = useScrub(n, goalI);
  const s = series(t.years);
  const years = t.years.map((y) => y.year);
  const goneI = t.loan?.gone_year != null ? t.loan.gone_year - t.years[0].year : null;
  const outI = t.at_goal.lasts < t.goal.plan_to ? t.at_goal.lasts - lead.age : null;
  const marks = [
    { i: goalI, label: `Stop ${t.goal.age}`, colour: COLOUR.super },
    { i: opensI, label: "Super opens", colour: TONE.good },
    ...(goneI != null && goneI <= n ? [{ i: goneI, label: "Loan gone", colour: COLOUR.loan }] : []),
    ...(outI != null ? [{ i: outI, label: "Runs out", colour: TONE.bad }] : []),
  ];
  const saved = t.goal.set ? t.goal.age : (t.pace?.retire_age ?? 60);
  const chips = Array.from(new Set([saved - 3, saved, t.pace?.retire_age ?? saved, saved + 3]))
    .filter((a) => a > lead.age && a <= 70)
    .sort((a, b) => a - b);
  const y = t.years[at];
  const loanEnd = Math.max(goalI, goneI != null ? goneI + 1 : goalI);
  const charts = [
    {
      key: "loan",
      name: "Home loan",
      to: "/early-retirement/debt" as const,
      rule: `Most you can owe each year and still be clear by ${t.goal.year}`,
      colour: COLOUR.loan,
      need: s.loanNeed,
      pace: s.loanPace,
      end: goalI,
      lower: true,
      needWord: "owe at most",
      zero: "Gone",
      show: t.loan != null && t.parts.loan.have > 0,
      note:
        t.loan?.gone_year != null && t.loan.gone_year <= t.goal.year
          ? `Fine as it is: on today's repayments it's gone in ${t.loan.gone_year}${t.loan.gone_year < t.goal.year ? `, ${t.goal.year - t.loan.gone_year} years early. Spare money does more in super or investments than in extra repayments` : ", right on time"}.`
          : `Behind: on today's repayments it's still there in ${t.goal.year}. Raise repayments or keep more in the offset.`,
      chartEnd: loanEnd,
    },
    {
      key: "outside",
      name: "Outside super",
      to: "/early-retirement/bridge" as const,
      rule: `Investments you can reach before ${t.opens}: they pay for ${t.goal.year} to ${t.years[opensI].year}`,
      colour: COLOUR.outside,
      need: s.outNeed,
      pace: s.outPace,
      end: opensI,
      lower: false,
      needWord: "need",
      zero: "Spent",
      show: true,
      note:
        t.goal.age < t.opens
          ? `Needs ${k(t.years[goalI].outside_need)} by ${t.goal.year}. On pace it reaches ${k(t.years[goalI].etfs)}.`
          : `Stopping at ${t.opens} or later, there's no bridge to pay for.`,
      chartEnd: n,
    },
    {
      key: "super",
      name: "Super",
      to: "/early-retirement/super" as const,
      rule: `Both funds together: open from ${t.opens}, then last to ${t.goal.plan_to}`,
      colour: COLOUR.super,
      need: s.superNeed,
      pace: s.superPace,
      end: n,
      lower: false,
      needWord: "need",
      zero: "Empty",
      show: true,
      note: `${t.parts.super.ahead < 0 ? "This is the part that's short. " : ""}Needs ${k(t.years[opensI].super_need)} when ${lead.name} turns ${t.opens}; on pace it's ${k(t.years[opensI].super)}.${outI != null ? ` It runs dry at ${t.at_goal.lasts}.` : ""}`,
      chartEnd: n,
    },
  ];
  const checks = Array.from(new Set([2, 4, 7, 10, 14, goalI, opensI].map((i) => Math.min(i, n))))
    .filter((i) => i > 0)
    .sort((a, b) => a - b);
  return (
    <>
      <div role="group" aria-label={`Stop work when ${lead.name} is`} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] text-ink-3">Try stopping at</span>
        {chips.map((a) => {
          const on = (goal ?? t.goal.age) === a;
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              onClick={() => setGoal(a === saved && t.goal.set ? null : a)}
              className={cn(
                "press min-h-11 cursor-pointer rounded-full border px-4 text-[14px] font-semibold",
                on ? "border-teal bg-teal text-on-solid" : "border-line-2 bg-transparent text-ink-2 hover:text-ink",
              )}
            >
              {a}
              {a === t.goal.age && t.goal.set && goal == null ? " · goal" : ""}
            </button>
          );
        })}
      </div>
      {charts
        .filter((c) => c.show)
        .map((c) => {
          const inRange = at <= c.end && c.need[at] != null;
          const nv = c.need[at] ?? 0;
          const pv = c.pace[at];
          const d = c.lower ? nv - pv : pv - nv;
          const tone: Tone = !inRange ? "good" : d >= 0 ? "good" : "warn";
          const pace = c.pace.slice(0, c.chartEnd + 1);
          return (
            <Card key={c.key} aria-labelledby={`cp-${c.key}`} className="gap-3.5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-3 rounded-md" style={{ background: c.colour }} />
                  <div>
                    <h2 id={`cp-${c.key}`} className="m-0 text-[20px] leading-7 font-semibold">
                      <Link to={c.to} className="text-ink no-underline hover:text-teal">
                        {c.name} →
                      </Link>
                    </h2>
                    <div className="text-[14px] text-ink-2">{c.rule}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-5" aria-live="polite">
                  <div>
                    <div className="text-[12px] text-ink-3">
                      {y.year} · {c.needWord}
                    </div>
                    <div className="num text-[20px]">{inRange ? money(Math.max(0, nv)) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-ink-3">On pace</div>
                    <div className="num text-[20px]" style={{ color: c.colour }}>
                      {at <= c.chartEnd ? (pv > 0 ? money(pv) : c.zero) : "—"}
                    </div>
                  </div>
                  <Status tone={tone}>
                    {!inRange
                      ? "Past this checkpoint"
                      : Math.abs(d) < 50_000
                        ? "Right on it"
                        : `${d >= 0 ? "Ahead" : "Behind"} ${k(Math.abs(d))}`}
                  </Status>
                </div>
              </div>
              <CompareChart
                need={c.need.slice(0, c.chartEnd + 1)}
                pace={pace}
                end={Math.min(c.end, c.chartEnd)}
                years={years.slice(0, c.chartEnd + 1)}
                colour={c.colour}
                lower={c.lower}
                at={Math.min(at, c.chartEnd)}
                handlers={handlers}
                marks={marks.filter((m) => m.i <= c.chartEnd)}
                label={`${c.name}: pick a year`}
              />
              <p className="m-0 text-[14px] leading-5 text-ink-2">{c.note}</p>
            </Card>
          );
        })}
      <Card aria-labelledby="cp-table" className="gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cp-table" className="m-0 text-[20px] leading-7 font-semibold">
            Checkpoints to hit
          </h2>
          <span className="text-[12px] text-ink-3">Where each part needs to be at the start of each year</span>
        </div>
        <div className="overflow-x-auto rounded-[14px] border border-line">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-sunken">
                <th scope="col" className="px-3 py-2.5 text-left text-[12px] font-medium text-ink-3">
                  Year · {lead.name}&apos;s age
                </th>
                {checks.map((i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 py-2.5 text-right text-[12px] font-semibold"
                    style={{ color: i === goalI ? COLOUR.super : i === opensI ? TONE.good : "var(--color-ink-2)" }}
                  >
                    {t.years[i].year} · {t.years[i].age}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.parts.loan.have > 0 && (
                <>
                  <Row
                    label="Loan · owe at most"
                    colour={COLOUR.loan}
                    cells={checks.map((i) => (i > goalI ? null : `≤ ${k(t.years[i].owe_max)}`))}
                  />
                  <Row
                    label="Loan · on pace"
                    cells={checks.map((i) => ({
                      text: t.years[i].owed > 0 ? k(t.years[i].owed) : "Gone",
                      good: i > goalI || t.years[i].owed <= (t.years[i].owe_max ?? 0) + 100,
                    }))}
                  />
                </>
              )}
              <Row
                label="Outside super · need"
                colour={COLOUR.outside}
                cells={checks.map((i) => (i > opensI ? null : `≥ ${k(t.years[i].outside_need)}`))}
              />
              <Row
                label="Outside super · on pace"
                cells={checks.map((i) => ({
                  text: k(t.years[i].etfs),
                  good: i > opensI || t.years[i].etfs >= t.years[i].outside_need - 100,
                }))}
              />
              <Row
                label="Super · need"
                colour={COLOUR.super}
                cells={checks.map((i) => `≥ ${k(t.years[i].super_need)}`)}
              />
              <Row
                label="Super · on pace"
                cells={checks.map((i) => ({
                  text: k(t.years[i].super),
                  good: t.years[i].super >= t.years[i].super_need - 100,
                }))}
              />
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[13px] text-ink-3">
          &quot;Need&quot; rows are the most the loan can be, or the least each balance can be, to stop at {t.goal.age}{" "}
          on today&apos;s contributions. Pace rows are where you&apos;ll be. Green means on or past the checkpoint.
        </p>
      </Card>
    </>
  );
}

function Row({
  label,
  colour,
  cells,
}: {
  label: string;
  colour?: string;
  cells: (string | null | { text: string; good: boolean })[];
}) {
  return (
    <tr>
      <th
        scope="row"
        className="border-t border-line px-3 py-2.5 text-left text-[13px] font-medium whitespace-nowrap"
        style={{ color: colour ?? "var(--color-ink-2)" }}
      >
        {label}
      </th>
      {cells.map((c, i) => (
        <td
          key={i}
          className="num border-t border-line px-3 py-2.5 text-right text-[13px] whitespace-nowrap"
          style={{
            color:
              c == null
                ? "var(--color-ink-3)"
                : typeof c === "string"
                  ? "var(--color-ink)"
                  : c.good
                    ? TONE.good
                    : TONE.warn,
          }}
        >
          {c == null ? "—" : typeof c === "string" ? c : c.text}
        </td>
      ))}
    </tr>
  );
}
