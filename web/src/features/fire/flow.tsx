/**
 * The early-retirement flows' shared pieces (Set the goal, Close the gap, Check in): a header with where you are and
 * a way out, numbered steps, option buttons that stay pressed, and the back / next row.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "~/features/common/ui";

export function FlowHead({ over, title, steps, step }: { over: string; title: string; steps: string[]; step: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Link
        to="/early-retirement"
        className="press inline-flex min-h-11 items-center rounded-xl border border-line bg-tile-2 px-4 text-[14px] font-semibold text-ink no-underline hover:border-line-2"
      >
        Close
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink-3">{over}</div>
        <h1 className="m-0 text-[22px] leading-7 font-semibold">{title}</h1>
      </div>
      {steps.length > 1 && (
        <ol aria-label="Steps" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {steps.map((s, i) => {
            const cur = i === step;
            const done = i < step;
            return (
              <li
                key={s}
                aria-current={cur ? "step" : undefined}
                className={cn(
                  "rounded-full px-2.5 py-[3px] text-xs font-semibold",
                  cur ? "bg-teal text-on-solid" : done ? "bg-good/12 text-good" : "bg-raised text-ink-3",
                )}
              >
                {i + 1} · {s}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function Option({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "press flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left",
        on ? "border-teal bg-teal/14" : "border-line-2 bg-tile-2 hover:border-ink-3",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function StepNav({
  back,
  backLabel = "Back",
  next,
  nextLabel = "Next",
  busy,
}: {
  back?: () => void;
  backLabel?: string;
  next?: () => void;
  nextLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      {back ? (
        <button
          type="button"
          onClick={back}
          className="press min-h-11 cursor-pointer rounded-xl border border-line-2 bg-transparent px-5 font-semibold text-ink"
        >
          {backLabel}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button
          type="button"
          onClick={next}
          disabled={busy}
          className="btn-primary press min-h-11 cursor-pointer rounded-xl px-5 font-semibold disabled:opacity-60"
        >
          {busy ? "Saving…" : nextLabel}
        </button>
      )}
    </div>
  );
}
