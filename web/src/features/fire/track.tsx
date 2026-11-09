/**
 * Are we on track: the pieces the early-retirement pages share. The answer for the goal (GET/POST /api/fire/track),
 * the verdict in words, each part's status, the life timeline and the year-by-year charts. Every figure comes from
 * the engine; the pages only draw it.
 *
 * Colours: super is the accent, outside super is invest cyan, the loan is offset blue; white dashes are always
 * "where it needs to be". Charts read out on hover, by dragging, or with the arrow keys.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { apiGet, apiSend } from "~/features/common/api";
import { ROLE } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { cn } from "~/features/common/ui";
import { trackQuery, type Part, type Track, type TrackLevers, type TrackReady, type TrackYear } from "./api";

export const COLOUR = { super: ROLE.accent, outside: ROLE.invest, loan: ROLE.offset } as const;

/** $364k, $1.47M; whole dollars under $1,000. */
export function k(c: number | null | undefined): string {
  if (c == null) return "—";
  const a = Math.abs(c) / 100;
  const s = c < 0 ? "−" : "";
  if (a >= 995_000) return `${s}$${(a / 1e6).toFixed(2).replace(/0$/, "")}M`;
  if (a >= 1000) return `${s}$${Math.round(a / 1000)}k`;
  return `${s}$${Math.round(a)}`;
}

/** The on-track answer, with levers tried (nothing saved) when given. Keeps the last answer while a new one loads. */
export function useTrack(levers?: Partial<TrackLevers> & Record<string, unknown>) {
  const tried = useDeferredValue(levers);
  const body = tried && Object.keys(tried).length ? tried : null;
  return useQuery({
    queryKey: body ? ["fire", "track", body] : trackQuery.queryKey,
    queryFn: ({ signal }) =>
      body ? apiSend<Track>("POST", "fire/track", body) : apiGet<Track>("fire/track", undefined, { signal }),
    placeholderData: keepPreviousData,
  });
}

export type Tone = "good" | "warn" | "bad";
export const TONE: Record<Tone, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
};

/** The headline: years behind or to spare, in words, and the sentence under it. */
export function verdictOf(t: TrackReady): { title: string; pill: string; tone: Tone; sentence: string } {
  const goal = t.goal.age;
  const pace = t.pace?.retire_age ?? null;
  const g = t.at_goal;
  const what =
    g.gap != null
      ? `outside super runs out at ${g.gap}, before super opens at ${t.opens}`
      : g.lasts < t.goal.plan_to
        ? `the money runs out at ${g.lasts}, ${t.goal.plan_to - g.lasts} years short of ${t.goal.plan_to}`
        : `the money lasts past ${t.goal.plan_to}`;
  const sentence =
    `To stop at ${goal} in ${t.goal.year} and spend ${money(t.goal.spend)} a year, ${what}.` +
    (pace != null && pace !== goal ? ` On today's pace you could stop at ${pace}, in ${t.pace?.retire_year}.` : "") +
    (pace == null ? " On today's pace it doesn't work by 70." : "");
  if (pace == null) return { title: "Not before 70", pill: "Off track", tone: "bad", sentence };
  if (pace > goal) {
    const d = pace - goal;
    return {
      title: `${d} ${d === 1 ? "year" : "years"} behind`,
      pill: "Behind",
      tone: d <= 2 ? "warn" : "bad",
      sentence,
    };
  }
  if (pace === goal) return { title: "On track", pill: "On track", tone: "good", sentence };
  const d = goal - pace;
  return { title: `${d} ${d === 1 ? "year" : "years"} to spare`, pill: "Ahead", tone: "good", sentence };
}

/** A part against its need: ahead or behind by how much. */
export function statusOf(p: Part): { label: string; tone: Tone } {
  return p.ahead >= 0
    ? { label: `Ahead ${k(p.ahead)}`, tone: "good" }
    : { label: `Behind ${k(-p.ahead)}`, tone: "warn" };
}

export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap"
      style={{ color: TONE[tone], background: `color-mix(in srgb, ${TONE[tone]} 13%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** Alex's life from today to the plan-to age: working, outside super pays, super pays; the gap and running out
 * striped. Marks for today, the goal, today's pace, super opening, running out and the plan-to age. */
export function LifeTimeline({ t, compact }: { t: TrackReady; compact?: boolean }) {
  const lead = t.people[0];
  const end = t.goal.plan_to;
  const L = (age: number) => Math.max(0, Math.min(100, ((age - lead.age) / (end - lead.age)) * 100));
  const goal = t.goal.age;
  const pace = t.pace?.retire_age ?? null;
  const out = t.at_goal.lasts < end ? t.at_goal.lasts : null;
  const year = (age: number) => t.goal.year + (age - goal);
  const marks = [
    {
      label: "Today",
      sub: `${lead.age} · ${year(lead.age)}`,
      at: L(lead.age),
      colour: "var(--color-ink)",
      edge: "start",
    },
    { label: "Stop · goal", sub: `${goal} · ${t.goal.year}`, at: L(goal), colour: COLOUR.super },
    ...(pace != null && pace !== goal
      ? [{ label: "Stop · pace", sub: `${pace} · ${year(pace)}`, at: L(pace), colour: TONE.warn }]
      : []),
    { label: "Super opens", sub: `${t.opens} · ${year(t.opens)}`, at: L(t.opens), colour: TONE.good },
    ...(out != null ? [{ label: "Runs out", sub: `${out} · ${year(out)}`, at: L(out), colour: TONE.bad }] : []),
    { label: "Plan to", sub: `${end} · ${year(end)}`, at: L(end), colour: "var(--color-ink-2)", edge: "end" },
  ] as { label: string; sub: string; at: number; colour: string; edge?: "start" | "end" }[];
  marks.sort((a, b) => a.at - b.at);
  const work = L(Math.min(goal, t.opens));
  const superAt = L(t.opens);
  const stripe = (c: string) =>
    `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 60%, transparent) 0 6px, color-mix(in srgb, ${c} 12%, transparent) 6px 12px)`;
  const pos = (m: (typeof marks)[number]) =>
    m.edge === "start"
      ? { left: `${m.at}%` }
      : m.edge === "end"
        ? { right: "0%" }
        : { left: `${m.at}%`, transform: "translateX(-50%)" };
  // Marks close together take turns on rows, so their labels don't run into each other.
  const lane: number[] = [];
  marks.forEach((m, i) => {
    const prev = marks.slice(0, i).filter((o) => Math.abs(o.at - m.at) < 11);
    const used = new Set(prev.map((o) => lane[marks.indexOf(o)]));
    let l = 0;
    while (used.has(l)) l++;
    lane.push(l);
  });
  const rows = Math.max(...lane) + 1;
  return (
    <div
      role="img"
      aria-label={`Timeline: stop at ${goal}, super opens at ${t.opens}, plan to ${end}${out ? `, money runs out at ${out}` : ""}.`}
    >
      {!compact && (
        <div className="relative" style={{ height: rows * 16 + 4 }}>
          {marks.map((m, i) => (
            <span
              key={m.label}
              className="absolute text-[11px] font-semibold whitespace-nowrap"
              style={{ ...pos(m), top: (rows - 1 - lane[i]) * 16, color: m.colour }}
            >
              {m.label}
            </span>
          ))}
        </div>
      )}
      <div className={cn("relative overflow-hidden rounded-xl border border-line bg-sunken", compact ? "h-5" : "h-10")}>
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${work}%`, background: `color-mix(in srgb, ${COLOUR.super} 24%, transparent)` }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${work}%`,
            width: `${Math.max(0, superAt - work)}%`,
            background: `color-mix(in srgb, ${COLOUR.outside} 24%, transparent)`,
          }}
        />
        <div
          className="absolute inset-y-0 right-0"
          style={{ left: `${superAt}%`, background: `color-mix(in srgb, ${TONE.good} 15%, transparent)` }}
        />
        {pace != null && pace > goal && (
          <div
            className="absolute inset-y-0"
            style={{ left: `${L(goal)}%`, width: `${L(pace) - L(goal)}%`, background: stripe(TONE.warn) }}
          />
        )}
        {out != null && (
          <div className="absolute inset-y-0 right-0" style={{ left: `${L(out)}%`, background: stripe(TONE.bad) }} />
        )}
        {!compact && (
          <div className="absolute inset-0 flex items-center text-[12px] font-semibold text-ink">
            <span className="absolute left-3 hidden sm:inline">Working</span>
            {superAt - work > 12 && (
              <span className="absolute hidden sm:inline" style={{ left: `${work + 1}%` }}>
                Outside super pays
              </span>
            )}
            <span className="absolute hidden sm:inline" style={{ left: `${superAt + 1}%` }}>
              Super pays
            </span>
          </div>
        )}
        {marks.map((m) => (
          <div
            key={m.label}
            className="absolute inset-y-0 w-0.5"
            style={{ left: `calc(${m.at}% - 1px)`, background: m.colour }}
          />
        ))}
      </div>
      {!compact && (
        <div className="relative mt-1.5" style={{ height: rows * 16 }}>
          {marks.map((m, i) => (
            <span
              key={m.label}
              className="mono absolute text-[11px] whitespace-nowrap text-ink-2"
              style={{ ...pos(m), top: lane[i] * 16 }}
            >
              {m.sub}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rows for labels along an axis (positions in %), so ones closer than `gap` don't overlap: 0 is the first row. */
export function lanes(at: number[], gap = 9): number[] {
  const out: number[] = [];
  at.forEach((a, i) => {
    const used = new Set(at.slice(0, i).flatMap((b, j) => (Math.abs(b - a) < gap ? [out[j]] : [])));
    let l = 0;
    while (used.has(l)) l++;
    out.push(l);
  });
  return out;
}

const pathOf = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

/** A part's need (dashed) against its pace (solid), from today to `end`, the space between tinted ahead or behind. */
export function PartSpark({
  need,
  pace,
  end,
  colour,
  ahead,
  label,
}: {
  need: number[];
  pace: number[];
  end: number;
  colour: string;
  ahead: boolean;
  label: string;
}) {
  const W = 320;
  const H = 88;
  const p = 6;
  const n = Math.max(1, Math.min(end, need.length - 1, pace.length - 1));
  const mx = Math.max(1, ...need.slice(0, n + 1), ...pace.slice(0, n + 1));
  const x = (i: number) => p + (i / n) * (W - 2 * p);
  const y = (v: number) => H - p - (Math.max(0, v) / mx) * (H - 2 * p);
  const N = need.slice(0, n + 1).map((v, i) => [x(i), y(v)] as [number, number]);
  const P = pace.slice(0, n + 1).map((v, i) => [x(i), y(v)] as [number, number]);
  const tone = ahead ? TONE.good : TONE.warn;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
      <path d={`${pathOf(N.concat([...P].reverse()))} Z`} style={{ fill: tone, fillOpacity: 0.14 }} />
      <path d={pathOf(N)} fill="none" style={{ stroke: "var(--color-ink)" }} strokeWidth={1.6} strokeDasharray="5 4" />
      <path d={pathOf(P)} fill="none" style={{ stroke: colour }} strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

/** Pointer, hover and arrow keys over a chart's plot: which point (0..n) is picked. */
export function useScrub(n: number, initial: number) {
  const [at, setAt] = useState<number | null>(null);
  const pick = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setAt(Math.round(f * n));
  };
  const handlers = {
    onPointerMove: pick,
    onPointerDown: pick,
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") setAt(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setAt((a) => Math.max(0, Math.min(n, (a ?? initial) + (e.key === "ArrowLeft" ? -1 : 1))));
    },
    tabIndex: 0,
    style: { touchAction: "pan-y" as const },
  };
  return { at: at ?? initial, handlers, active: at != null };
}

type Geo = { W: number; H: number; pl: number; pr: number; pt: number; pb: number };

/** Every year from today to the plan-to age: super stacked on outside super, the loan owed below zero, and the
 * dashed line of what's needed. `at` is the year being read out. */
export function YearChart({
  t,
  at,
  handlers,
  label,
}: {
  t: TrackReady;
  at: number;
  handlers: ReturnType<typeof useScrub>["handlers"];
  label: string;
}) {
  const ys = t.years;
  const n = ys.length - 1;
  const g: Geo = { W: 1200, H: 380, pl: 64, pr: 16, pt: 48, pb: 30 };
  const tot = ys.map((y) => y.super + y.etfs);
  const need = ys.map((y) => y.super_need + y.outside_need);
  const mx = Math.max(1, ...tot, ...need);
  const step = mx > 160_000_000 ? 50_000_000 : mx > 60_000_000 ? 25_000_000 : 10_000_000;
  const top = Math.ceil(mx / step) * step;
  const owedMax = Math.max(0, ...ys.map((y) => y.owed));
  const bottom = owedMax > 0 ? -Math.ceil(owedMax / step) * step : 0;
  const xs = (i: number) => g.pl + (i / n) * (g.W - g.pl - g.pr);
  const yv = (v: number) => g.pt + ((top - v) / (top - bottom)) * (g.H - g.pt - g.pb);
  const z = yv(0);
  const base = ys.map((_, i) => [xs(i), z] as [number, number]);
  const eTop = ys.map((y, i) => [xs(i), yv(y.etfs)] as [number, number]);
  const sTop = ys.map((_, i) => [xs(i), yv(tot[i])] as [number, number]);
  const lo = ys.map((y, i) => [xs(i), yv(-y.owed)] as [number, number]);
  const ticks: { v: number; label: string }[] = [];
  for (let v = step; v <= top; v += step) ticks.push({ v, label: k(v) });
  ticks.push({ v: 0, label: "$0" });
  if (bottom < 0) ticks.push({ v: bottom / 2, label: `${k(-bottom / 2)} owed` });
  const goalI = t.goal.age - t.people[0].age;
  const paceI = t.pace ? t.pace.retire_age - t.people[0].age : null;
  const outI = t.at_goal.lasts < t.goal.plan_to ? t.at_goal.lasts - t.people[0].age : null;
  const marks = [
    { i: goalI, label: `Stop ${t.goal.age}`, colour: COLOUR.super },
    ...(paceI != null && paceI !== goalI && paceI <= n
      ? [{ i: paceI, label: `Pace ${t.pace?.retire_age}`, colour: TONE.warn }]
      : []),
    { i: t.opens - t.people[0].age, label: `Super ${t.opens}`, colour: TONE.good },
    ...(outI != null ? [{ i: outI, label: "Runs out", colour: TONE.bad }] : []),
  ];
  const lane = lanes(marks.map((m) => (xs(m.i) / g.W) * 100));
  const short = ys
    .map((y, i) =>
      y.short > 0
        ? `M${xs(i).toFixed(1)} ${g.pt} H${Math.min(xs(i + 1), g.W - g.pr).toFixed(1)} V${z.toFixed(1)} H${xs(i).toFixed(1)} Z`
        : "",
    )
    .join(" ");
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="relative w-full" style={{ aspectRatio: `${g.W} / ${g.H}` }}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <pattern id="yc-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" style={{ fill: TONE.bad, fillOpacity: 0.1 }} />
            <rect width="3" height="8" style={{ fill: TONE.bad, fillOpacity: 0.5 }} />
          </pattern>
        </defs>
        {ticks.map((tk) => (
          <path
            key={tk.label}
            d={`M${g.pl} ${yv(tk.v).toFixed(1)} H${g.W - g.pr}`}
            style={{ stroke: tk.v === 0 ? "var(--color-line-2)" : "var(--color-line)" }}
            strokeWidth={tk.v === 0 ? 1.5 : 1}
          />
        ))}
        <path d={short} fill="url(#yc-hatch)" />
        {owedMax > 0 && (
          <path d={`${pathOf(base.concat([...lo].reverse()))} Z`} style={{ fill: COLOUR.loan, fillOpacity: 0.32 }} />
        )}
        <path d={`${pathOf(eTop.concat([...base].reverse()))} Z`} style={{ fill: COLOUR.outside, fillOpacity: 0.34 }} />
        <path d={`${pathOf(sTop.concat([...eTop].reverse()))} Z`} style={{ fill: COLOUR.super, fillOpacity: 0.36 }} />
        <path d={pathOf(sTop)} fill="none" style={{ stroke: COLOUR.super }} strokeWidth={2} />
        <path
          d={pathOf(need.map((v, i) => [xs(i), yv(v)]))}
          fill="none"
          style={{ stroke: "var(--color-ink)" }}
          strokeWidth={2}
          strokeDasharray="7 5"
        />
        {marks.map((m) => (
          <path
            key={m.label}
            d={`M${xs(m.i).toFixed(1)} ${g.pt} V${g.H - g.pb}`}
            style={{ stroke: "var(--color-ink-3)" }}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}
        <line
          x1={xs(at)}
          x2={xs(at)}
          y1={18}
          y2={g.H - g.pb}
          style={{ stroke: "var(--color-ink)" }}
          strokeWidth={1.2}
        />
        <circle
          cx={xs(at)}
          cy={yv(tot[at])}
          r={5}
          style={{ fill: COLOUR.super, stroke: "var(--color-page)" }}
          strokeWidth={2}
        />
        <circle
          cx={xs(at)}
          cy={yv(need[at])}
          r={5}
          style={{ fill: "var(--color-page)", stroke: "var(--color-ink)" }}
          strokeWidth={2}
        />
      </svg>
      {ticks.map((tk) => (
        <span
          key={tk.label}
          className="mono absolute left-0 -translate-y-1/2 text-[11px] text-ink-3"
          style={{ top: pc(yv(tk.v), g.H) }}
        >
          {tk.label}
        </span>
      ))}
      {marks.map((m, mi) => (
        <span
          key={m.label}
          className="absolute -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap"
          style={{ left: pc(xs(m.i), g.W), top: lane[mi] * 15, color: m.colour }}
        >
          {m.label}
        </span>
      ))}
      {ys.map((y, i) =>
        i % 9 === 0 ? (
          <span
            key={y.year}
            className="mono absolute bottom-0 -translate-x-1/2 text-[11px] text-ink-3"
            style={{ left: pc(xs(i), g.W) }}
          >
            {y.year}
          </span>
        ) : null,
      )}
      <div
        {...handlers}
        role="slider"
        aria-label={label}
        aria-valuemin={ys[0].year}
        aria-valuemax={ys[n].year}
        aria-valuenow={ys[at].year}
        aria-valuetext={`${ys[at].year}: ${money(tot[at])} on pace, ${money(need[at])} needed`}
        className="absolute inset-y-0 cursor-crosshair rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal"
        style={{ ...handlers.style, left: pc(g.pl, g.W), right: pc(g.pr, g.W) }}
      />
    </div>
  );
}

/** One part of the plan against its need, a year at a time, ahead tinted green and behind amber. `lower` when less
 * is better (the loan). Reads out the picked year above. */
export function CompareChart({
  need,
  pace,
  end,
  years,
  colour,
  lower,
  at,
  handlers,
  marks = [],
  label,
  height = 250,
}: {
  need: (number | null)[];
  pace: number[];
  end: number;
  years: number[];
  colour: string;
  lower?: boolean;
  at: number;
  handlers: ReturnType<typeof useScrub>["handlers"];
  marks?: { i: number; label: string; colour: string }[];
  label: string;
  height?: number;
}) {
  const n = pace.length - 1;
  const g: Geo = { W: 1200, H: height, pl: 64, pr: 16, pt: 48, pb: 28 };
  const nd = need.map((v) => v ?? 0);
  const mx = Math.max(1, ...nd.slice(0, end + 1), ...pace);
  const step = mx > 150_000_000 ? 50_000_000 : mx > 60_000_000 ? 25_000_000 : mx > 25_000_000 ? 10_000_000 : 5_000_000;
  const top = Math.ceil(mx / step) * step;
  const xs = (i: number) => g.pl + (i / n) * (g.W - g.pl - g.pr);
  const yv = (v: number) => g.pt + ((top - Math.max(0, v)) / top) * (g.H - g.pt - g.pb);
  const N = nd.slice(0, end + 1).map((v, i) => [xs(i), yv(v)] as [number, number]);
  const hiTop = N.map(([x, y], i) => [x, Math.min(y, yv(pace[i]))] as [number, number]);
  const loBot = N.map(([x, y], i) => [x, Math.max(y, yv(pace[i]))] as [number, number]);
  const above = `${pathOf(hiTop.concat([...N].reverse()))} Z`;
  const below = `${pathOf(N.concat([...loBot].reverse()))} Z`;
  const P = pace.map((v, i) => [xs(i), yv(v)] as [number, number]);
  const B = pace.map((_, i) => [xs(i), yv(0)] as [number, number]);
  const lane = lanes(marks.map((m) => (xs(m.i) / g.W) * 100));
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const pc = (v: number, of: number) => `${(v / of) * 100}%`;
  const inRange = at <= end && need[at] != null;
  return (
    <div className="relative w-full" style={{ aspectRatio: `${g.W} / ${g.H}` }}>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} className="absolute inset-0 size-full" aria-hidden>
        {ticks.map((v) => (
          <path
            key={v}
            d={`M${g.pl} ${yv(v).toFixed(1)} H${g.W - g.pr}`}
            style={{ stroke: "var(--color-line)" }}
            strokeWidth={1}
          />
        ))}
        <path d={`${pathOf(P.concat([...B].reverse()))} Z`} style={{ fill: colour, fillOpacity: 0.12 }} />
        <path d={lower ? below : above} style={{ fill: TONE.good, fillOpacity: 0.26 }} />
        <path d={lower ? above : below} style={{ fill: TONE.warn, fillOpacity: 0.3 }} />
        <path d={pathOf(N)} fill="none" style={{ stroke: "var(--color-ink)" }} strokeWidth={2} strokeDasharray="7 5" />
        <path d={pathOf(P)} fill="none" style={{ stroke: colour }} strokeWidth={2.6} strokeLinecap="round" />
        {marks.map((m) => (
          <path
            key={m.label}
            d={`M${xs(m.i).toFixed(1)} ${g.pt} V${g.H - g.pb}`}
            style={{ stroke: "var(--color-ink-3)" }}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}
        <line
          x1={xs(at)}
          x2={xs(at)}
          y1={22}
          y2={g.H - g.pb}
          style={{ stroke: "var(--color-ink)" }}
          strokeWidth={1.2}
        />
        {inRange && (
          <circle
            cx={xs(at)}
            cy={yv(nd[at])}
            r={5}
            style={{ fill: "var(--color-page)", stroke: "var(--color-ink)" }}
            strokeWidth={2}
          />
        )}
        <circle
          cx={xs(at)}
          cy={yv(pace[at])}
          r={5}
          style={{ fill: colour, stroke: "var(--color-page)" }}
          strokeWidth={2}
        />
      </svg>
      {ticks.map((v) => (
        <span
          key={v}
          className="mono absolute left-0 -translate-y-1/2 text-[11px] text-ink-3"
          style={{ top: pc(yv(v), g.H) }}
        >
          {k(v)}
        </span>
      ))}
      {marks.map((m, mi) => (
        <span
          key={m.label}
          className="absolute -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap"
          style={{ left: pc(xs(m.i), g.W), top: lane[mi] * 15, color: m.colour }}
        >
          {m.label}
        </span>
      ))}
      {years.map((y, i) =>
        i % Math.max(1, Math.round(n / 7)) === 0 ? (
          <span
            key={y}
            className="mono absolute bottom-0 -translate-x-1/2 text-[11px] text-ink-3"
            style={{ left: pc(xs(i), g.W) }}
          >
            {y}
          </span>
        ) : null,
      )}
      <div
        {...handlers}
        role="slider"
        aria-label={label}
        aria-valuemin={years[0]}
        aria-valuemax={years[n]}
        aria-valuenow={years[at]}
        className="absolute inset-y-0 cursor-crosshair rounded-lg outline-offset-2 focus-visible:outline-2 focus-visible:outline-teal"
        style={{ ...handlers.style, left: pc(g.pl, g.W), right: pc(g.pr, g.W) }}
      />
    </div>
  );
}

/** Each part's need and pace as arrays, from the years. */
export function series(ys: TrackYear[]) {
  return {
    superNeed: ys.map((y) => y.super_need),
    superPace: ys.map((y) => y.super),
    outNeed: ys.map((y) => y.outside_need),
    outPace: ys.map((y) => y.etfs),
    loanNeed: ys.map((y) => y.owe_max),
    loanPace: ys.map((y) => y.owed),
  };
}
