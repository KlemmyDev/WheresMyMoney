/**
 * The pieces a step-by-step flow is made of (adding an account, the set-up guide):
 *
 * - StepFlow: the current step, sliding in from the side you're heading (forward from the right, back from the left,
 *   320ms on the enter curve) while its frame eases to the new step's height, so nothing jumps.
 * - StepDots: where you are, as dots joined by a line that fills as you go.
 * - JobPicker: an account's job as cards, each with a small drawing of the chart that job gets, what it's for and
 *   what you'll see. The chosen one takes its role colour and its drawing draws itself in.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { colour, ROLE_LABEL } from "~/features/common/format";
import type { Role } from "~/features/common/types";
import { cn } from "~/features/common/ui";
import "~/styles/steps.css";

/** Remembers which way the step last moved, for StepFlow. */
export function useStep(count: number, start = 0) {
  const [state, setState] = useState({ step: start, dir: 1 as 1 | -1 });
  return {
    step: state.step,
    dir: state.dir,
    go: (to: number) => setState((s) => ({ step: Math.max(0, Math.min(count - 1, to)), dir: to >= s.step ? 1 : -1 })),
    next: () => setState((s) => ({ step: Math.min(count - 1, s.step + 1), dir: 1 })),
    back: () => setState((s) => ({ step: Math.max(0, s.step - 1), dir: -1 })),
  };
}

export function StepFlow({
  step,
  dir,
  children,
  className,
}: {
  step: number | string;
  dir: 1 | -1;
  children: ReactNode;
  className?: string;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      className="-m-1 overflow-hidden transition-[height] duration-[320ms] ease-[var(--ease-move)] motion-reduce:transition-none"
      style={{ height: height ?? "auto" }}
    >
      <div ref={inner} className={cn("p-1", className)}>
        <div key={step} className={dir > 0 ? "step-fwd" : "step-back"}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StepDots({ steps, step, className }: { steps: string[]; step: number; className?: string }) {
  return (
    <ol className={cn("relative m-0 flex list-none items-center justify-between p-0", className)} aria-label="Steps">
      <span aria-hidden className="absolute inset-x-1.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-line" />
      <span
        aria-hidden
        className="absolute top-1/2 left-1.5 h-0.5 -translate-y-1/2 rounded-full bg-teal transition-[width] duration-[360ms] ease-[var(--ease-move)]"
        style={{ width: `calc((100% - 12px) * ${steps.length > 1 ? step / (steps.length - 1) : 0})` }}
      />
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          aria-label={`${s}${i < step ? ", done" : ""}`}
          className={cn(
            "relative size-3 rounded-full border-2 transition-[background-color,border-color,transform] duration-[240ms]",
            i < step && "border-teal bg-teal",
            i === step && "scale-125 border-teal bg-page",
            i > step && "border-line bg-tile",
          )}
        />
      ))}
    </ol>
  );
}

export const JOBS: Role[] = ["offset", "bills", "spending", "savings", "track"];

export const JOB: Record<Role, { what: string; get: string }> = {
  offset: { what: "Grows until it covers the loan", get: "Target: 100% of the loan" },
  bills: { what: "Holds a few months of bills", get: "Months-of-bills target, alert if it dips" },
  spending: { what: "Everyday money, topped up monthly", get: "Monthly allowance and pace" },
  savings: { what: "Split into things you're saving for", get: "Goals with progress bars" },
  track: { what: "Just a balance, no target", get: "Balance and trend" },
};

/** A tiny drawing of the chart each job gets. `draw` makes its line draw itself in. */
export function JobArt({ role, draw = false, size = 44 }: { role: Role; draw?: boolean; size?: number }) {
  const c = colour(role);
  const line = (d: string, delay = 0, w = 3) => (
    <path
      d={d}
      fill="none"
      stroke={c}
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={100}
      className={draw ? "draw" : undefined}
      style={draw ? ({ strokeDasharray: 100, "--len": 100, animationDelay: `${delay}ms` } as CSSProperties) : undefined}
    />
  );
  const track = (d: string) => (
    <path d={d} fill="none" stroke="var(--color-line)" strokeWidth={3} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 44 32" width={size} height={(size * 32) / 44} aria-hidden className="flex-none">
      {role === "offset" && (
        <>
          {track("M10 25 A13 13 0 1 1 34 25")}
          {line("M10 25 A13 13 0 0 1 30 7")}
        </>
      )}
      {role === "bills" && (
        <>
          {track("M8 26 A14 14 0 0 1 36 26")}
          {line("M8 26 A14 14 0 0 1 31 15")}
          <circle
            cx="31"
            cy="15"
            r="2.5"
            fill={c}
            className={draw ? "pop" : undefined}
            style={{ animationDelay: "500ms" }}
          />
        </>
      )}
      {role === "spending" && (
        <>
          {track("M6 24h32")}
          {line("M6 24h20")}
          {line("M6 12h32", 120, 2)}
          <path d="M6 12h32" stroke="var(--color-line)" strokeWidth="2" strokeDasharray="2 3" opacity="0.6" />
        </>
      )}
      {role === "savings" && (
        <>
          {track("M6 8h32")}
          {track("M6 16h32")}
          {track("M6 24h32")}
          {line("M6 8h26")}
          {line("M6 16h18", 80)}
          {line("M6 24h9", 160)}
        </>
      )}
      {role === "track" && line("M5 24 L13 18 L20 21 L28 11 L39 14")}
    </svg>
  );
}

/** The job cards. `compact` (the set-up guide's rows): a row of chips, with the chosen job's line under it. */
export function JobPicker({
  value,
  onChange,
  compact = false,
  label = "What is this account for?",
}: {
  value: Role;
  onChange: (r: Role) => void;
  compact?: boolean;
  label?: string;
}) {
  if (compact)
    return (
      <div className="flex flex-col gap-1.5">
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
          {JOBS.map((r) => {
            const on = r === value;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(r)}
                className="press flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium"
                style={
                  on
                    ? {
                        borderColor: colour(r),
                        color: "var(--color-ink)",
                        background: `color-mix(in srgb, ${colour(r)} 14%, transparent)`,
                      }
                    : {
                        borderColor: "var(--color-line)",
                        color: "var(--color-ink-2)",
                        background: "var(--color-raised)",
                      }
                }
              >
                <span className="size-2 rounded-full" style={{ background: colour(r) }} />
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <div key={value} className="fade-in text-xs text-ink-3">
          {JOB[value].what}. {JOB[value].get}.
        </div>
      </div>
    );
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {JOBS.map((r, i) => {
        const on = r === value;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(r)}
            className={cn(
              "press rise relative flex cursor-pointer flex-col items-start gap-2 rounded-xl border bg-raised p-3 text-left",
              r === "track" && "col-span-2 sm:col-span-1",
            )}
            style={
              {
                "--i": i,
                borderColor: on ? colour(r) : "var(--color-line)",
                background: on ? `color-mix(in srgb, ${colour(r)} 10%, var(--color-raised))` : undefined,
                boxShadow: on ? `inset 0 0 0 1px ${colour(r)}` : undefined,
              } as CSSProperties
            }
          >
            <JobArt key={on ? "on" : "off"} role={r} draw={on} />
            <span className="text-[13.5px] font-semibold text-ink">{ROLE_LABEL[r]}</span>
            <span className="text-xs leading-snug text-ink-2">{JOB[r].what}</span>
            {on && (
              <span
                className="pop absolute top-2.5 right-2.5 flex size-5 items-center justify-center rounded-full"
                style={{ background: colour(r) }}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="var(--color-page)"
                  strokeWidth="3.2"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
