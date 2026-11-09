/**
 * Early retirement: Who pays for each year (the FIRE on track canvas's "Retirement years"). From the goal age to the
 * plan-to age, a bar a year coloured by which pot pays (outside super first, the offset while the loan's on, then
 * super once it opens), striped red where nothing's left; above it, what's left in each pot. Try other ages to stop
 * and other spending (nothing saved). Every figure is the engine's (POST /api/fire/track).
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FireNav } from "~/features/fire/FireNav";
import type { TrackReady } from "~/features/fire/api";
import { COLOUR, Status, TONE, k, useScrub, useTrack } from "~/features/fire/track";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { Empty, ErrorText, PageHead, cn } from "~/features/common/ui";

const POTS = [
  { key: "etfs", name: "Outside super", colour: COLOUR.outside },
  { key: "cash", name: "Cash", colour: "var(--color-ink-3)" },
  { key: "offset", name: "Offset", colour: COLOUR.loan },
  { key: "super", name: "Super", colour: COLOUR.super },
] as const;

export function FireDrawdown() {
  const [goal, setGoal] = useState<number | null>(null);
  const [spend, setSpend] = useState<number | null>(null);
  const q = useTrack({ ...(goal != null ? { goal } : {}), ...(spend != null ? { spend } : {}) });
  if (q.isError && !q.data) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const t = q.data;
  return (
    <>
      <PageHead over="Future · Early retirement" title="Who pays for each year" />
      <p className="-mt-2 mb-0 max-w-[680px] text-[14px] text-ink-3">
        Every bar is one year once you&apos;ve stopped. Its colour says which pot pays. Red stripes are years nothing is
        left to pay with.
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
        <Draw t={t} goal={goal} setGoal={setGoal} spend={spend} setSpend={setSpend} />
      )}
    </>
  );
}

function Chips<T extends number>({
  label,
  options,
  on,
  pick,
  show,
}: {
  label: string;
  options: T[];
  on: T;
  pick: (v: T) => void;
  show: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12px] text-ink-3">{label}</span>
      {options.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === on}
          onClick={() => pick(v)}
          className={cn(
            "press min-h-11 cursor-pointer rounded-full border px-4 text-[14px] font-semibold",
            v === on ? "border-teal bg-teal text-on-solid" : "border-line-2 bg-transparent text-ink-2 hover:text-ink",
          )}
        >
          {show(v)}
        </button>
      ))}
    </div>
  );
}

function Draw({
  t,
  goal,
  setGoal,
  spend,
  setSpend,
}: {
  t: TrackReady;
  goal: number | null;
  setGoal: (g: number | null) => void;
  spend: number | null;
  setSpend: (s: number | null) => void;
}) {
  const lead = t.people[0];
  const start = t.years.findIndex((y) => y.age === t.goal.age);
  const yrs = t.years.slice(Math.max(start, 0)).filter((y) => y.age <= t.goal.plan_to);
  const n = yrs.length;
  const { at, handlers } = useScrub(Math.max(n - 1, 1), 0);
  const savedGoal = t.goal.set ? t.goal.age : (t.pace?.retire_age ?? 60);
  const ages = Array.from(new Set([savedGoal - 3, savedGoal, t.pace?.retire_age ?? savedGoal, t.opens]))
    .filter((a) => a > lead.age && a <= 70)
    .sort((a, b) => a - b);
  const base = spend == null ? t.goal.spend : t.goal.spend;
  const spends = Array.from(
    new Set([base - 1_000_000, base, base + 1_500_000].map((v) => Math.round(v / 100_000) * 100_000)),
  );

  // Bars: spending each year by pot.
  const W = 1200;
  const H = 300;
  const pl = 64;
  const pr = 16;
  const pt = 14;
  const pb = 26;
  const slot = (W - pl - pr) / Math.max(n, 1);
  const bw = Math.max(4, slot * 0.72);
  const cx = (i: number) => pl + i * slot + slot / 2;
  const yMax = Math.ceil((t.goal.spend * 1.2) / 2_000_000) * 2_000_000;
  const yb = (v: number) => pt + ((yMax - v) / yMax) * (H - pt - pb);
  const rect = (x: number, y0: number, y1: number) =>
    y0 - y1 < 0.5
      ? ""
      : `M${x.toFixed(1)} ${y1.toFixed(1)} h${bw.toFixed(1)} V${y0.toFixed(1)} h${(-bw).toFixed(1)} Z `;
  const bars: Record<string, string> = { etfs: "", cash: "", offset: "", super: "", short: "" };
  yrs.forEach((y, i) => {
    let c = 0;
    const p = y.paid ?? { etfs: 0, cash: 0, offset: 0, super: 0, short: 0 };
    for (const key of ["etfs", "cash", "offset", "super", "short"] as const) {
      bars[key] += rect(cx(i) - bw / 2, yb(c), yb(c + p[key]));
      c += p[key];
    }
  });
  const ticksB: number[] = [];
  for (let v = 2_000_000; v <= yMax; v += 2_000_000) ticksB.push(v);

  // Lines: what's left in each pot.
  const H2 = 200;
  const mx = Math.max(1, ...yrs.flatMap((y) => [y.super, y.etfs]));
  const step = mx > 100_000_000 ? 50_000_000 : 25_000_000;
  const top = Math.ceil(mx / step) * step;
  const yl = (v: number) => 10 + ((top - Math.max(0, v)) / top) * (H2 - 20);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)} ${yl(v).toFixed(1)}`).join(" ");
  const ticksL: number[] = [];
  for (let v = step; v <= top; v += step) ticksL.push(v);

  const sum = (key: "etfs" | "cash" | "offset" | "super" | "short") =>
    yrs.reduce((s, y) => s + (y.paid?.[key] ?? 0), 0);
  const shortYears = yrs.filter((y) => y.short > 0).length;
  const bridgeYears = Math.max(0, t.opens - t.goal.age);
  const y = yrs[Math.min(at, n - 1)];
  const p = y?.paid ?? { etfs: 0, cash: 0, offset: 0, super: 0, short: 0 };
  const paidBy =
    p.short > 0
      ? "Nothing left for part of it"
      : [p.etfs + p.cash > 0 && "outside super", p.offset > 0 && "the offset", p.super > 0 && "super"]
          .filter(Boolean)
          .join(", then ");
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  if (!y) return null;
  return (
    <>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Chips
          label="Stop at"
          options={ages}
          on={goal ?? t.goal.age}
          pick={(a) => setGoal(a === savedGoal && t.goal.set ? null : a)}
          show={String}
        />
        <Chips
          label="Spend"
          options={spends}
          on={spend ?? t.goal.spend}
          pick={(v) => setSpend(v === t.goal.spend && spend == null ? null : v)}
          show={k}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          swatch={COLOUR.outside}
          name="Outside super pays"
          value={money(sum("etfs") + sum("cash") + sum("offset"))}
        >
          {bridgeYears > 0
            ? `${bridgeYears} bridge years, ${t.goal.age} to ${t.opens}, plus whatever's left after.`
            : `No bridge: super opens the year you stop.`}
        </Summary>
        <Summary swatch={COLOUR.super} name="Super pays" value={money(sum("super"))}>
          {t.people.map((x) => `${x.name}'s from ${x.opens}`).join(", ")}.
        </Summary>
        <Summary
          swatch={TONE.bad}
          name="Not covered"
          value={sum("short") > 0 ? money(sum("short")) : "Nothing"}
          tone={sum("short") > 0 ? "bad" : "good"}
        >
          {sum("short") > 0
            ? `${shortYears} years short, from ${t.at_goal.lasts}.`
            : `Every year to ${t.goal.plan_to} is paid for.`}
        </Summary>
        <Summary swatch="var(--color-ink-3)" name="Age pension" value="Not counted">
          Left out on purpose, so the plan errs on the careful side.
        </Summary>
      </div>
      <Card aria-labelledby="dd-chart" className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="dd-chart" className="m-0 text-[20px] leading-7 font-semibold">
              Retirement, {t.goal.age} to {t.goal.plan_to} ({yrs[0].year}–{yrs[n - 1].year})
            </h2>
            <div className="text-[12px] text-ink-3">
              Lines: what&apos;s left in each pot · bars: each year&apos;s spending, by who pays
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
            {POTS.filter((x) => sum(x.key) > 0).map((x) => (
              <span key={x.key} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[3px]" style={{ background: x.colour }} />
                {x.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-3 rounded-[3px] border"
                style={{
                  borderColor: TONE.bad,
                  background: `repeating-linear-gradient(135deg, ${TONE.bad} 0 3px, transparent 3px 6px)`,
                }}
              />
              Not covered
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-stretch gap-5">
          <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-1.5">
            <div className="relative w-full" style={{ aspectRatio: `${W} / ${H2}` }}>
              <svg viewBox={`0 0 ${W} ${H2}`} className="absolute inset-0 size-full" aria-hidden>
                {ticksL.map((v) => (
                  <path
                    key={v}
                    d={`M${pl} ${yl(v).toFixed(1)} H${W - pr}`}
                    style={{ stroke: "var(--color-line)" }}
                    strokeWidth={1}
                  />
                ))}
                <path
                  d={line(yrs.map((x) => x.etfs))}
                  fill="none"
                  style={{ stroke: COLOUR.outside }}
                  strokeWidth={2.2}
                />
                <path
                  d={line(yrs.map((x) => x.super))}
                  fill="none"
                  style={{ stroke: COLOUR.super }}
                  strokeWidth={2.2}
                />
                <line
                  x1={cx(at)}
                  x2={cx(at)}
                  y1={8}
                  y2={H2 - 8}
                  style={{ stroke: "var(--color-ink)" }}
                  strokeWidth={1.2}
                />
              </svg>
              {ticksL.map((v) => (
                <span
                  key={v}
                  className="mono absolute left-0 -translate-y-1/2 text-[11px] text-ink-3"
                  style={{ top: pc(yl(v), H2) }}
                >
                  {k(v)}
                </span>
              ))}
              <div
                {...handlers}
                aria-hidden
                tabIndex={-1}
                className="absolute inset-y-0 cursor-crosshair"
                style={{ ...handlers.style, left: pc(pl, W), right: pc(pr, W) }}
              />
            </div>
            <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
              <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden>
                <defs>
                  <pattern
                    id="dd-hatch"
                    width="8"
                    height="8"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="8" height="8" style={{ fill: TONE.bad, fillOpacity: 0.12 }} />
                    <rect width="3" height="8" style={{ fill: TONE.bad, fillOpacity: 0.7 }} />
                  </pattern>
                </defs>
                {ticksB.map((v) => (
                  <path
                    key={v}
                    d={`M${pl} ${yb(v).toFixed(1)} H${W - pr}`}
                    style={{ stroke: "var(--color-line)" }}
                    strokeWidth={1}
                  />
                ))}
                <path
                  d={`M${(pl + at * slot).toFixed(1)} ${pt} h${slot.toFixed(1)} V${H - pb} h${(-slot).toFixed(1)} Z`}
                  style={{ fill: "var(--color-ink)", fillOpacity: 0.06 }}
                />
                {POTS.map((x) => (
                  <path key={x.key} d={bars[x.key]} style={{ fill: x.colour }} />
                ))}
                <path d={bars.short} fill="url(#dd-hatch)" style={{ stroke: TONE.bad }} strokeWidth={1} />
                <path
                  d={`M${pl} ${yb(t.goal.spend).toFixed(1)} H${W - pr}`}
                  fill="none"
                  style={{ stroke: "var(--color-ink)" }}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
              </svg>
              {ticksB.map((v) => (
                <span
                  key={v}
                  className="mono absolute left-0 -translate-y-1/2 text-[11px] text-ink-3"
                  style={{ top: pc(yb(v), H) }}
                >
                  {k(v)}
                </span>
              ))}
              {yrs.map((x, i) =>
                i === 0 || x.age % 5 === 0 || i === n - 1 ? (
                  <span
                    key={x.age}
                    className="mono absolute bottom-0 -translate-x-1/2 text-[11px]"
                    style={{ left: pc(cx(i), W), color: x.age === t.opens ? TONE.good : "var(--color-ink-3)" }}
                  >
                    {x.age}
                  </span>
                ) : null,
              )}
              <div
                {...handlers}
                role="slider"
                aria-label="Pick a year of retirement"
                aria-valuemin={yrs[0].year}
                aria-valuemax={yrs[n - 1].year}
                aria-valuenow={y.year}
                aria-valuetext={`${y.year}: ${paidBy}`}
                className="absolute inset-y-0 cursor-crosshair rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal"
                style={{ ...handlers.style, left: pc(pl, W), right: pc(pr, W) }}
              />
            </div>
            <div className="text-center text-[12px] text-ink-3">{lead.name}&apos;s age</div>
          </div>
          <aside
            className="flex flex-[1_1_240px] flex-col gap-3 rounded-[18px] border border-line bg-sunken p-4"
            aria-live="polite"
          >
            <div>
              <div className="num text-[24px] leading-[30px]">{y.year}</div>
              <div className="text-[12px] text-ink-3">
                {[
                  `${lead.name} ${y.age}`,
                  ...t.people.slice(1).map((x) => `${x.name} ${x.age + (y.age - lead.age)}`),
                ].join(" · ")}
              </div>
            </div>
            <span className="self-start">
              <Status tone={p.short > 0 ? "bad" : "good"}>{p.short > 0 ? `Short ${money(p.short)}` : "Covered"}</Status>
            </span>
            <div className="text-[13px] text-ink-2">Paid by {paidBy}.</div>
            <dl className="m-0 flex flex-col gap-2 text-[14px]">
              {POTS.filter((x) => sum(x.key) > 0).map((x) => (
                <div key={x.key} className="flex justify-between gap-2">
                  <dt className="text-ink-2">From {x.name.toLowerCase()}</dt>
                  <dd className="num m-0" style={{ color: x.colour }}>
                    {money(p[x.key])}
                  </dd>
                </div>
              ))}
              <div className="h-px bg-line" />
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Left outside super</dt>
                <dd className="num m-0">{money(y.etfs)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-2">Left in super</dt>
                <dd className="num m-0">{money(y.super)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </Card>
    </>
  );
}

function Summary({
  swatch,
  name,
  value,
  tone,
  children,
}: {
  swatch: string;
  name: string;
  value: string;
  tone?: "good" | "bad";
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-1.5 p-[18px]">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-[3px]" style={{ background: swatch }} />
        <span className="font-semibold">{name}</span>
      </div>
      <div className="num text-[24px] leading-[30px]" style={tone ? { color: TONE[tone] } : undefined}>
        {value}
      </div>
      <div className="text-[13px] leading-[18px] text-ink-2">{children}</div>
    </Card>
  );
}
