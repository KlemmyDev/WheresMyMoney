/** The Cockpit's building blocks: tiles, pills, buttons, switches, segmented choices and money inputs. */
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import { colour } from "~/features/common/format";

export const cn = (...parts: (string | false | null | undefined)[]) => twMerge(parts.filter(Boolean).join(" "));

/** A tile on the page. `i` staggers its rise (the first 8, 40ms apart). */
export function Tile({
  children,
  className,
  i,
  style,
  as = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  i?: number;
  style?: CSSProperties;
  as?: "section" | "div" | "aside";
} & Record<string, unknown>) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-tile border border-line bg-tile px-5 py-[18px]",
        i != null && "rise",
        className,
      )}
      style={{ ...(i != null ? ({ "--i": i } as CSSProperties) : {}), ...style }}
    >
      {children}
    </Tag>
  );
}

export function TileTitle({ children, right, id }: { children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="tt">
      <span id={id}>{children}</span>
      {right != null && <span className="flex items-center gap-2 tracking-normal normal-case">{right}</span>}
    </div>
  );
}

const PILL = {
  good: "text-good bg-good/12",
  warn: "text-warn bg-warn/12",
  bad: "text-bad bg-bad/12",
  info: "text-offset bg-offset/13",
  mute: "text-ink-3 bg-raised",
  role: "text-ink-2 bg-raised",
  teal: "text-teal bg-teal/12",
};

export function Pill({ tone = "mute", children }: { tone?: keyof typeof PILL; children: ReactNode }) {
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        PILL[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ c, className }: { c: string | null | undefined; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("inline-block size-2 flex-none rounded-full", className)}
      style={{ background: colour(c) }}
    />
  );
}

export function Button({
  primary,
  className,
  small,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "press inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3.5 text-[13px] font-medium disabled:cursor-default disabled:opacity-50",
        small ? "min-h-8 px-2.5 text-xs" : "min-h-10",
        primary
          ? "border-teal bg-teal font-semibold text-page enabled:hover:bg-teal-hover"
          : "border-line bg-tile text-ink enabled:hover:bg-raised",
        className,
      )}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  labelledBy?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 flex-none cursor-pointer rounded-full border p-0 transition-colors duration-150 ease-[var(--ease-enter)]",
        checked ? "border-teal bg-teal" : "border-line bg-raised",
      )}
    >
      <i
        className={cn(
          "absolute top-0.5 size-[18px] rounded-full transition-[left,background-color] duration-150 ease-[var(--ease-enter)]",
          checked ? "left-[18px] bg-page" : "left-0.5 bg-ink-3",
        )}
      />
    </button>
  );
}

/** A row of choices, one pressed. `tone` colours the pressed one (an account role's colour). */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  label,
  tone = "teal",
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  tone?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className="press min-h-9 cursor-pointer rounded-md border px-3 text-[13px] font-medium"
            style={
              on
                ? {
                    borderColor: colour(tone),
                    color: "var(--color-ink)",
                    background: `color-mix(in srgb, ${colour(tone)} 12%, transparent)`,
                  }
                : { borderColor: "var(--color-line)", color: "var(--color-ink-2)", background: "var(--color-raised)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The header's compact segmented control (30D, 6M, 1Y, All). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-tile p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "press min-h-8 cursor-pointer rounded-md border-0 px-3 text-[13px] font-medium",
            o.value === value ? "bg-raised text-ink" : "bg-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        // Figures by default; `font-sans` (a name, a note) opts out of the mono class, which twMerge can't see.
        !className?.includes("font-sans") && "mono",
        "min-h-[42px] w-full rounded-lg border border-line bg-page px-3 text-sm font-medium text-ink transition-[border-color,box-shadow] duration-150 ease-[var(--ease-enter)] placeholder:text-ink-3 focus:border-teal focus:shadow-[0_0_0_3px_rgb(45_212_191/0.2)] focus:outline-none",
        className,
      )}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn(
        "min-h-[42px] w-full cursor-pointer rounded-lg border border-line bg-page px-3 text-sm text-ink focus:border-teal focus:outline-none",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs text-ink-3">
      {children}
    </label>
  );
}

/** A choice with a radio dot, a title and a line under it (an adjustment's date, "these are exact"). */
export function Option({
  on,
  onClick,
  title,
  children,
  role = "radio",
}: {
  on: boolean;
  onClick: () => void;
  title: ReactNode;
  children?: ReactNode;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "press flex w-full cursor-pointer items-start gap-2.5 rounded-lg border bg-raised px-3 py-2.5 text-left text-[13px]",
        on ? "border-teal shadow-[inset_0_0_0_1px_var(--color-teal)]" : "border-line",
      )}
    >
      <span
        className={cn(
          "relative mt-0.5 size-4 flex-none rounded-full border-2 transition-colors duration-150",
          on ? "border-teal" : "border-ink-3",
        )}
      >
        {on && <span className="pop absolute inset-0.5 rounded-full bg-teal" />}
      </span>
      <span>
        <b className="font-semibold">{title}</b>
        {children && (
          <>
            <br />
            <span className="text-ink-2">{children}</span>
          </>
        )}
      </span>
    </button>
  );
}

/** The one springy moment: a tick when something important is saved (420ms). */
export function SuccessTick({ size = 72 }: { size?: number }) {
  return (
    <div
      className="pop flex items-center justify-center rounded-full bg-good/15"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        width={size / 2}
        height={size / 2}
        fill="none"
        stroke="var(--color-good)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          className="draw"
          style={{ strokeDasharray: 22, ["--len" as string]: 22, animationDuration: "420ms", animationDelay: "120ms" }}
        />
      </svg>
    </div>
  );
}

export function Field({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center justify-between gap-3 border-t border-line px-3.5 first:border-t-0",
        className,
      )}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Tile className="items-start">
      <div className="text-base font-semibold">{title}</div>
      {children && <div className="text-ink-2">{children}</div>}
      {action}
    </Tile>
  );
}

export function PageHead({ over, title, actions }: { over: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mono text-xs text-ink-3 uppercase">{over}</div>
        <h1 className="mt-1 mb-0 text-[26px] font-semibold">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="reveal rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[13px] text-bad">
      {children}
    </div>
  );
}
