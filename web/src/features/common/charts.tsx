/**
 * Gauges and charts, drawn as the motion spec has them: arcs sweep from their start (or the value last seen) to the
 * value in 700ms, lines draw left to right and then their fill fades in, bars grow from the baseline in reading order.
 * With reduced motion they appear already drawn.
 */
import type { CSSProperties, ReactNode } from "react";
import { useCountUp, useSweep } from "~/features/common/motion";

/** A figure that counts up from the last value seen (600ms). `format` writes it (cents in, text out). */
export function Count({ k, value, format }: { k: string; value: number; format: (v: number) => ReactNode }) {
  const shown = useCountUp(k, value);
  return <>{format(Math.round(shown))}</>;
}

const RING = { outer: 90, inner: 70, sweep: 0.75 };

/** The loan coverage gauge: all offsetting accounts (outer, teal) and the offset account alone (inner, blue). */
export function CoverageRing({
  k,
  all,
  offset,
  size = 220,
  children,
}: {
  k: string;
  all: number;
  offset: number;
  size?: number;
  children?: ReactNode;
}) {
  const a = useSweep(`${k}:all`, Math.min(Math.max(all, 0), 1));
  const o = useSweep(`${k}:offset`, Math.min(Math.max(offset, 0), 1));
  const c1 = 2 * Math.PI * RING.outer;
  const c2 = 2 * Math.PI * RING.inner;
  const label = `All accounts cover ${(all * 100).toFixed(1)} percent of the loan; offset account alone ${(offset * 100).toFixed(1)} percent`;
  return (
    <div className="relative flex-none" style={{ width: size, height: size * 0.91 }}>
      <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={label} className="absolute top-0">
        <g transform="rotate(135 110 110)" fill="none" strokeLinecap="round">
          <circle
            cx="110"
            cy="110"
            r={RING.outer}
            stroke="var(--color-raised)"
            strokeWidth="14"
            strokeDasharray={`${c1 * RING.sweep} ${c1}`}
          />
          <circle
            cx="110"
            cy="110"
            r={RING.outer}
            stroke="var(--color-teal)"
            strokeWidth="14"
            strokeDasharray={`${c1 * RING.sweep * a} ${c1}`}
          />
          <circle
            cx="110"
            cy="110"
            r={RING.inner}
            stroke="var(--color-raised)"
            strokeWidth="8"
            strokeDasharray={`${c2 * RING.sweep} ${c2}`}
          />
          <circle
            cx="110"
            cy="110"
            r={RING.inner}
            stroke="var(--color-offset)"
            strokeWidth="8"
            strokeDasharray={`${c2 * RING.sweep * o} ${c2}`}
          />
        </g>
      </svg>
      <div className="absolute inset-x-0 text-center" style={{ top: size * 0.336 }}>
        {children}
      </div>
    </div>
  );
}

/** A half-circle gauge: `value` and `mark` (a target, or even pace) as fractions of its full sweep. */
export function ArcGauge({
  k,
  value,
  mark,
  colour,
  label,
  children,
}: {
  k: string;
  value: number;
  mark?: number | null;
  colour: string;
  label: string;
  children?: ReactNode;
}) {
  const v = useSweep(k, Math.min(Math.max(value, 0), 1));
  const len = Math.PI * 70;
  const angle = mark != null ? Math.PI * (1 - Math.min(Math.max(mark, 0), 1)) : null;
  return (
    <div className="relative h-[100px]">
      <svg viewBox="0 0 160 90" width="100%" height="100" role="img" aria-label={label}>
        <path
          d="M10 80A70 70 0 0 1 150 80"
          fill="none"
          stroke="var(--color-raised)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M10 80A70 70 0 0 1 150 80"
          fill="none"
          stroke={colour}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${len * v} 300`}
        />
        {angle != null && (
          <line
            x1={80 + 58 * Math.cos(angle)}
            y1={80 - 58 * Math.sin(angle)}
            x2={80 + 82 * Math.cos(angle)}
            y2={80 - 82 * Math.sin(angle)}
            stroke="var(--color-ink)"
            strokeWidth="2.5"
          />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">{children}</div>
    </div>
  );
}

function scale(values: number[], height: number, pad = 6, floor?: number, ceil?: number) {
  const lo = floor ?? Math.min(...values);
  const hi = ceil ?? Math.max(...values);
  const span = hi - lo || 1;
  return (v: number) => pad + (height - pad * 2) * (1 - (v - lo) / span);
}

/** A line that draws left to right, its fill fading in after; an optional dashed target. */
export function AreaLine({
  values,
  colour,
  height = 90,
  target,
  label,
  min,
  max,
  fill = true,
}: {
  values: number[];
  colour: string;
  height?: number;
  target?: number | null;
  label: string;
  min?: number;
  max?: number;
  fill?: boolean;
}) {
  if (values.length < 2) return <div style={{ height }} className="rounded-lg bg-raised/40" aria-label={label} />;
  const w = 600;
  const all = target != null ? [...values, target] : values;
  const y = scale(all, height, 6, min ?? Math.min(...all) * 0.98, max ?? Math.max(...all) * 1.02);
  const step = w / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {target != null && (
        <line
          x1="0"
          x2={w}
          y1={y(target)}
          y2={y(target)}
          stroke="var(--color-ink-3)"
          strokeWidth="1"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {fill && (
        <path
          d={`${d}L${w} ${height}L0 ${height}Z`}
          fill={`color-mix(in srgb, ${colour} 13%, transparent)`}
          className="fill-after"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        pathLength={1000}
        className="draw"
        style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
      />
    </svg>
  );
}

/** A small trend line for a table row. */
export function Spark({ values, colour, floor }: { values: number[]; colour: string; floor?: number }) {
  if (values.length < 2) return <svg width="90" height="24" aria-hidden />;
  const y = scale(values, 24, 3, floor != null ? Math.min(floor, ...values) : undefined);
  const step = 90 / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 90 24" width="90" height="24" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        pathLength={1000}
        className="draw"
        style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
      />
    </svg>
  );
}

/** Pairs of bars (in, out) a month, growing from the baseline one after another. */
export function FlowBars({
  months,
  label,
}: {
  months: { label: string; in: number; out: number; partial?: boolean }[];
  label: string;
}) {
  const hi = Math.max(1, ...months.flatMap((m) => [m.in, m.out]));
  const ticks = niceTicks(hi);
  return (
    <div className="flex gap-2.5">
      <div className="mono flex h-[200px] flex-col justify-between text-right text-xs text-ink-3">
        {[...ticks].reverse().map((t) => (
          <span key={t}>{short(t)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="relative flex h-[200px] items-end justify-around border-b border-line"
          role="img"
          aria-label={label}
        >
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-line"
              style={{ bottom: `${(t / ticks[ticks.length - 1]) * 100}%` }}
            />
          ))}
          {months.map((m, i) => (
            <div
              key={m.label}
              className="relative flex h-full items-end gap-1"
              style={{ opacity: m.partial ? 0.55 : 1 }}
            >
              <div
                className="w-[min(30px,4vw)] grow rounded-t-sm bg-teal"
                style={
                  { height: `${(m.in / ticks[ticks.length - 1]) * 100}%`, ["--i" as string]: i * 2 } as CSSProperties
                }
              />
              <div
                className="w-[min(30px,4vw)] grow rounded-t-sm bg-out"
                style={
                  {
                    height: `${(m.out / ticks[ticks.length - 1]) * 100}%`,
                    ["--i" as string]: i * 2 + 1,
                  } as CSSProperties
                }
              />
            </div>
          ))}
        </div>
        <div
          className="mono mt-1.5 grid text-center text-xs text-ink-3"
          style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
        >
          {months.map((m) => (
            <span key={m.label}>{m.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A bar a day across the spending month: spent days in violet, days to come flat and grey, today marked. */
export function DayBars({
  daily,
  today,
  pace,
  label,
}: {
  daily: number[];
  today: number;
  pace: number;
  label: string;
}) {
  const hi = Math.max(pace * 2, ...daily, 1);
  const ticks = niceTicks(hi);
  const top = ticks[ticks.length - 1];
  return (
    <div className="flex gap-2.5">
      <div className="mono flex h-[170px] flex-col justify-between text-right text-xs text-ink-3">
        {[...ticks].reverse().map((t) => (
          <span key={t}>${short(t)}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="relative flex h-[170px] items-end gap-[3px] border-b border-line" role="img" aria-label={label}>
          <div
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2"
            style={{ bottom: `${(pace / top) * 100}%` }}
          />
          {daily.map((v, i) => {
            const past = i < today;
            return (
              <div key={i} className="relative flex h-full flex-1 items-end">
                {i === today - 1 && <div className="absolute inset-y-0 -right-[2px] w-px bg-teal" />}
                <div
                  className={past ? "w-full grow rounded-t-[2px] bg-spending" : "w-full rounded-t-[2px] bg-raised"}
                  style={
                    { height: past ? `max(2px, ${(v / top) * 100}%)` : "2px", ["--i" as string]: i } as CSSProperties
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function niceTicks(hi: number): number[] {
  const raw = hi / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 3 >= hi) ?? mag * 10;
  return [0, step, step * 2, step * 3];
}

/** Cents as 15k, 2.5k, 300. */
export function short(cents: number): string {
  const d = cents / 100;
  if (Math.abs(d) >= 1000) return `${+(d / 1000).toFixed(1)}k`;
  return `${Math.round(d)}`;
}
