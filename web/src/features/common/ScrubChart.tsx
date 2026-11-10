/**
 * A line chart to read by dragging across it (or hovering, or the arrow keys): one or more lines over the same points,
 * the first filled underneath, a dashed one for what's put in or likely. Vertical swipes still scroll the page.
 * `marks` draws labelled vertical lines (retiring, the loan gone).
 */
import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export type Line = { values: (number | null)[]; colour: string; name: string; fill?: boolean; dashed?: boolean };

export function ScrubChart({
  lines,
  label,
  at,
  format,
  height = 180,
  marks = [],
  floor,
  axis,
  axisAt,
  note,
}: {
  lines: Line[];
  /** What a screen reader calls it. */
  label: string;
  /** The label of point i (a date, an age). */
  at: (i: number) => string;
  format: (v: number) => ReactNode;
  height?: number;
  marks?: { i: number; label: string; colour?: string }[];
  /** The bottom of the scale (0 for balances); otherwise just under the lowest value. */
  floor?: number;
  /** Labels along the bottom, at these points. */
  axis?: number[];
  /** A shorter label for the bottom (defaults to `at`). */
  axisAt?: (i: number) => string;
  /** More to say about point i in the readout (what happened that day). */
  note?: (i: number) => ReactNode;
}) {
  const id = useId();
  const [pt, setPt] = useState<number | null>(null);
  const n = Math.max(0, ...lines.map((l) => l.values.length));
  const all = lines.flatMap((l) => l.values.filter((v): v is number => v != null));
  if (n < 2 || !all.length) return <div style={{ height }} className="rounded-xl bg-raised/40" aria-label={label} />;
  const hiV = Math.max(...all);
  const loV = floor ?? Math.min(...all);
  const pad = (hiV - loV) * 0.08 || 1;
  const lo = floor ?? loV - pad;
  const hi = hiV + pad;
  const H = 200;
  const W = 600;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const shown = pt ?? n - 1;
  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPt(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPt(Math.min(n - 1, Math.max(0, shown + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const main = lines[0];
  const mainAt = main.values[shown];
  return (
    <div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={shown + 1}
        aria-valuetext={`${at(shown)}: ${lines
          .map((l) => (l.values[shown] != null ? `${l.name} ${String(l.values[shown])}` : ""))
          .filter(Boolean)
          .join(", ")}`}
        onPointerDown={scrub}
        onPointerMove={scrub}
        onPointerLeave={(e) => e.pointerType === "mouse" && setPt(null)}
        onKeyDown={onKey}
        className="relative cursor-ew-resize touch-pan-y rounded-xl outline-offset-4 select-none"
        style={{ height }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 block h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={main.colour} stopOpacity={0.35} />
              <stop offset="1" stopColor={main.colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          {[...lines].reverse().map((l) => {
            const d = path(l.values);
            return (
              <g key={l.name}>
                {l.fill && d && (
                  <path
                    d={`${d} L${x(l.values.findLastIndex((v) => v != null))} ${H} L${x(l.values.findIndex((v) => v != null))} ${H} Z`}
                    fill={l === main ? `url(#${id}-g)` : `color-mix(in srgb, ${l.colour} 18%, transparent)`}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={l.colour}
                  strokeWidth={l.dashed ? 1.6 : 2.6}
                  strokeDasharray={l.dashed ? "6 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </svg>
        {marks.map((m) => (
          <span
            key={`${m.i}-${m.label}`}
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed"
            style={{ left: `${(m.i / (n - 1)) * 100}%`, borderColor: m.colour ?? "var(--color-ink-3)" }}
          >
            <span
              className="absolute bottom-1 left-1 rounded-md bg-tile/80 px-1 text-[11px] whitespace-nowrap"
              style={{ color: m.colour ?? "var(--color-ink-3)" }}
            >
              {m.label}
            </span>
          </span>
        ))}
        {pt != null && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink-3"
              style={{ left: `${(pt / (n - 1)) * 100}%` }}
            />
            {mainAt != null && (
              <span
                aria-hidden
                className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  left: `${(pt / (n - 1)) * 100}%`,
                  top: `${(y(mainAt) / H) * 100}%`,
                  boxShadow: `0 0 0 4px ${main.colour}`,
                }}
              />
            )}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 -translate-x-1/2 rounded-xl border border-line-2 bg-raised px-2.5 py-1.5 whitespace-nowrap shadow-[var(--shadow-float)]"
              style={{ left: `clamp(72px, ${(pt / (n - 1)) * 100}%, calc(100% - 72px))` }}
            >
              <span className="block text-[11px] text-ink-3">{at(pt)}</span>
              {lines.map((l) =>
                l.values[pt] != null ? (
                  <span key={l.name} className="flex items-center gap-1.5 text-[13px]">
                    <i className="size-2 rounded-full" style={{ background: l.colour }} />
                    <span className="text-ink-3">{l.name}</span>
                    <span className="num text-ink">{format(l.values[pt] as number)}</span>
                  </span>
                ) : null,
              )}
              {note?.(pt)}
            </span>
          </>
        )}
      </div>
      {axis && (
        <div className="relative mt-1.5 h-4 text-[11px] text-ink-3">
          {axis.map((i, k) => (
            <span
              key={i}
              className="absolute whitespace-nowrap"
              style={{
                left: `${(i / (n - 1)) * 100}%`,
                transform: k === 0 ? "none" : k === axis.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {(axisAt ?? at)(i)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
