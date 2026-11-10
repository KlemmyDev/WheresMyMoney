/**
 * The entity page: one thing (a category, a merchant, a bill, an account, a goal, a holding) looked at closely, in the
 * same order everywhere, from the uplift canvas (EnPattern):
 *
 * 1. EntityHeader: back to its list, its mark, its name and a line about it, the timeframe, and Change.
 * 2. EntityHero: a lit card that says it in a sentence, with See the numbers for the figures behind it.
 * 3. MonthBars: month by month against a budget or an expected line, this month's likely rest hatched.
 * 4. LikelyCard: what's likely this month and next.
 * 5. Context cards (the page's own), then its transactions.
 *
 * Changing the thing happens in an EditPanel: inline under the header on a desktop, a bottom sheet on a phone, with
 * Save as its one primary button and Remove as a quiet one that ends in an undo toast, never a confirm dialog.
 */
import { Link } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { short } from "~/features/common/charts";
import { Bar, Card, CardHead, Details, ROLE, Sheet, Stat, type Role, type Segment } from "~/features/common/ds";
import { Button, Segmented, cn } from "~/features/common/ui";

// ---------------------------------------------------------------- timeframe

export const MONTH_RANGES = [
  { value: "1", label: "Month" },
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "Year" },
] as const;
export type MonthRange = (typeof MONTH_RANGES)[number]["value"];

/** A timeframe that this device remembers per kind of page (`key`), falling back to `initial`. */
export function useTimeframe<T extends string>(
  key: string,
  options: readonly { value: T; label: string }[],
  initial: T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key);
      return options.some((o) => o.value === v) ? (v as T) : initial;
    } catch {
      return initial;
    }
  });
  const pick = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* remembered only while the page is open */
    }
  };
  return [value, pick];
}

/** "this month" or "the last 3 months". */
export function rangeName(months: number): string {
  return months === 1 ? "this month" : `the last ${months} months`;
}

// ---------------------------------------------------------------- header

/** The top of an entity page: back link, mark, name and its line, then the timeframe and any actions (Change). */
export function EntityHeader({
  back,
  mark,
  title,
  sub,
  timeframe,
  actions,
}: {
  back: { to: string; label: string };
  mark?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  timeframe?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link to={back.to} className="self-start text-[14px] font-semibold text-teal no-underline">
        ← {back.label}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          {mark}
          <div className="min-w-0">
            <h1 className="m-0 truncate text-[28px] font-semibold tracking-tight">{title}</h1>
            {sub != null && <div className="text-[14px] text-ink-3">{sub}</div>}
          </div>
        </div>
        {(timeframe || actions) && (
          <div className="flex flex-wrap items-center gap-2.5">
            {timeframe}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** The timeframe control, remembered per page kind (see useTimeframe). */
export function Timeframe<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return <Segmented label="Timeframe" options={[...options]} value={value} onChange={onChange} />;
}

// ---------------------------------------------------------------- hero

export type Figure = { label: ReactNode; value: ReactNode; note?: ReactNode };

/** The lit card that says it in a sentence. The figures behind it sit under See the numbers. */
export function EntityHero({
  tint,
  label,
  children,
  numbers,
}: {
  tint: Role;
  label: string;
  children: ReactNode;
  numbers?: Figure[];
}) {
  return (
    <Card lit tint={tint} aria-label={label}>
      {children}
      {numbers && numbers.length > 0 && (
        <Details label="See the numbers">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {numbers.map((n, i) => (
              <Stat key={i} label={n.label} value={n.value} note={n.note} role={tint} />
            ))}
          </div>
        </Details>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- month by month

type LegendItem = { label: string; kind: "solid" | "likely" | "line"; role: Role };

/** The key over a chart: a solid square, a hatched square or a dashed line per item. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <span className="flex flex-wrap gap-3.5 text-[13px] font-medium text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === "solid" && <i className="size-2 rounded-sm" style={{ background: ROLE[it.role] }} />}
          {it.kind === "likely" && (
            <i className="hatched size-2.5 rounded-sm" style={{ ["--c" as string]: ROLE[it.role] }} />
          )}
          {it.kind === "line" && <i className="w-3.5 border-t-2 border-dashed border-ink-2" />}
          {it.label}
        </span>
      ))}
    </span>
  );
}

/** Round numbers for a chart's axis: 0 and three steps reaching `hi`. */
export function ticks(hi: number): number[] {
  const raw = hi / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * 3 >= hi) ?? mag * 10;
  return [0, step, step * 2, step * 3];
}

export type MonthValue = { key: string; label: string; value: number };

/**
 * A bar per month, oldest first, with this month's likely rest hatched on top and an optional dashed line (a budget,
 * or what's expected). Months before `litFrom` are dimmed so the timeframe stands out. Pick a bar (tap, hover, or the
 * arrow keys) to read it in the line above.
 */
export function MonthBars({
  months,
  rest = 0,
  line,
  role = "spending",
  litFrom,
  name,
  format,
  describe,
  height = 200,
  current = true,
}: {
  months: MonthValue[];
  rest?: number;
  line?: { value: number; label: string };
  role?: Role;
  litFrom?: string;
  name: string;
  format: (cents: number) => string;
  describe?: (m: MonthValue, isNow: boolean) => ReactNode;
  height?: number;
  /** The last bar is this month, so far (false when every bar is ahead). */
  current?: boolean;
}) {
  const n = months.length;
  const [picked, setPicked] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);
  if (!n) return null;
  const at = Math.min(picked ?? (current ? n - 1 : 0), n - 1);
  const hi = Math.max(1, line?.value ?? 0, ...months.map((m, i) => m.value + (i === n - 1 ? rest : 0)));
  const t = ticks(hi);
  const top = t.at(-1) ?? hi;
  const m = months[at];
  const isNow = current && at === n - 1;
  const colour = ROLE[role];
  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-6 text-[14px] text-ink-2" aria-live="polite">
        {describe ? (
          describe(m, isNow)
        ) : (
          <>
            <b className="text-ink">{m.label}</b>: {format(m.value)}
            {isNow ? " so far" : ""}
            {isNow && rest > 0 ? `, likely about ${format(m.value + rest)} by the end` : ""}.
          </>
        )}
      </div>
      <div className="flex gap-2.5">
        <div className="mono flex flex-col justify-between text-right text-xs text-ink-3" style={{ height }}>
          {[...t].reverse().map((v) => (
            <span key={v}>${short(v)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="relative flex items-end gap-1 border-b border-line"
            style={{ height }}
            role="group"
            aria-label={`${name} each month, oldest first`}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const next = Math.max(0, Math.min(n - 1, at + (e.key === "ArrowLeft" ? -1 : 1)));
                setPicked(next);
                (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
              }
            }}
          >
            {months.map((mo, i) => {
              const likely = i === n - 1 ? rest : 0;
              const lit = litFrom == null || mo.key >= litFrom;
              return (
                <button
                  key={mo.key}
                  type="button"
                  tabIndex={i === at ? 0 : -1}
                  aria-label={`${mo.label}: ${format(mo.value)}`}
                  aria-pressed={i === at}
                  onClick={() => setPicked(i)}
                  onMouseEnter={() => setPicked(i)}
                  className="relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end border-0 bg-transparent p-0"
                >
                  {likely > 0 && (
                    <span
                      className="hatched block w-full rounded-t-[4px]"
                      style={{ height: `${(likely / top) * 100}%`, ["--c" as string]: colour }}
                    />
                  )}
                  <span
                    className={cn(
                      "striped block w-full transition-opacity",
                      likely > 0 ? "" : "rounded-t-[4px]",
                      !lit && "opacity-35",
                      lit && i !== at && "opacity-75",
                    )}
                    style={
                      {
                        height: `max(2px, ${(Math.max(0, mo.value) / top) * 100}%)`,
                        backgroundColor: colour,
                        flexGrow: 0,
                        "--i": i,
                      } as CSSProperties
                    }
                  />
                </button>
              );
            })}
            {line != null && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink"
                style={{ bottom: `${(line.value / top) * 100}%` }}
              />
            )}
            {hovering && (
              // While a pointer is over the chart, the bar it's on reads out beside it.
              <span
                aria-hidden
                className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-xl border border-line-2 bg-raised px-2.5 py-1.5 whitespace-nowrap shadow-[var(--shadow-float)]"
                style={{ left: `clamp(72px, ${((at + 0.5) / n) * 100}%, calc(100% - 72px))` }}
              >
                <span className="block text-[11px] text-ink-3">
                  {m.label}
                  {isNow ? " · so far" : ""}
                </span>
                <span className="num block text-[14px] text-ink">{format(m.value)}</span>
                {isNow && rest > 0 && (
                  <span className="block text-[11px] text-ink-3">likely {format(m.value + rest)} by the end</span>
                )}
                {line != null && (
                  <span className={cn("block text-[11px]", m.value > line.value ? "text-bad" : "text-good")}>
                    {format(Math.abs(m.value - line.value))} {m.value > line.value ? "over" : "under"} the{" "}
                    {line.label.toLowerCase()}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="mono mt-1.5 flex justify-between text-xs text-ink-3">
            <span>{months[0].label}</span>
            <span>{months[n - 1].label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- what's likely

/**
 * Where this month is likely to finish (a figure, a bar of spent and hatched likely, a sentence) and the month after.
 * Before there's enough history, `notReady` says when there will be.
 */
export function LikelyCard({
  id,
  className,
  notReady,
  now,
  next,
  note,
}: {
  id: string;
  className?: string;
  notReady?: ReactNode;
  now?: {
    label: string;
    total: ReactNode;
    bar: { segments: Segment[]; max: number; marker?: number; label: string };
    text: ReactNode;
  };
  next?: { label: string; total: ReactNode; text: ReactNode };
  note?: ReactNode;
}) {
  if (notReady != null || !now)
    return (
      <Card className={className} aria-labelledby={id}>
        <CardHead id={id} title="What's likely" />
        <p className="m-0 text-[14px] text-ink-2">{notReady}</p>
      </Card>
    );
  return (
    <Card className={className} tint="accent" aria-labelledby={id}>
      <CardHead id={id} title="What's likely" />
      <div className="flex flex-col gap-2">
        <div className="text-[13px] text-ink-3">{now.label}</div>
        <div className="mono text-[26px] font-semibold">{now.total}</div>
        <Bar label={now.bar.label} max={now.bar.max} height={12} marker={now.bar.marker} segments={now.bar.segments} />
        <div className="text-[13px] text-ink-2">{now.text}</div>
      </div>
      {next && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="text-[13px] text-ink-3">{next.label}</div>
          <div className="mono text-[22px] font-semibold">{next.total}</div>
          <div className="text-[13px] text-ink-2">{next.text}</div>
        </div>
      )}
      {note != null && <div className="text-[12px] text-ink-3">{note}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------- days of the week

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/**
 * What went on each day of the week (Monday first, cents), the busiest day brightest. Pick a day (tap, hover, or the
 * arrow keys) to read it in the line above; otherwise the line names the busiest day.
 */
export function WeekdaysCard({
  id,
  values,
  over,
  role = "spending",
  className,
}: {
  id: string;
  values: number[];
  /** Over what time, for the corner: "the last 12 months". */
  over: string;
  role?: Role;
  className?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const hi = Math.max(...values, 1);
  const top = values.indexOf(hi);
  const at = picked ?? top;
  return (
    <Card aria-labelledby={id} className={className}>
      <CardHead id={id} title="Days of the week" right={<span className="text-[13px] text-ink-3">{over}</span>} />
      <p className="m-0 min-h-6 text-[14px] text-ink-2" aria-live="polite">
        {picked == null ? "Most goes on " : "On "}
        <b className="text-ink">{WEEKDAY_NAMES[at]}</b>, ${short(values[at])}, {Math.round((values[at] / total) * 100)}%
        of it.
      </p>
      <div
        role="group"
        aria-label="Spent on each day of the week"
        className="flex h-[120px] items-end gap-2"
        onMouseLeave={() => setPicked(null)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          if (!step) return;
          e.preventDefault();
          const n = (at + step + 7) % 7;
          setPicked(n);
          document.getElementById(`${id}-${n}`)?.focus();
        }}
      >
        {values.map((v, i) => (
          <button
            key={i}
            id={`${id}-${i}`}
            type="button"
            aria-label={`${WEEKDAY_NAMES[i]}: $${short(v)}`}
            aria-pressed={picked === i}
            onMouseEnter={() => setPicked(i)}
            onFocus={() => setPicked(i)}
            onBlur={() => setPicked(null)}
            onClick={() => setPicked(i)}
            className="flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-1.5 rounded-md border-0 bg-transparent p-0"
          >
            <span className="mono text-[11px] text-ink-3">{v ? `$${short(v)}` : ""}</span>
            <span
              className={cn("striped w-full grow rounded-t-[4px]", i !== at && "opacity-55")}
              style={
                {
                  height: `max(2px, ${(v / hi) * 70}%)`,
                  flexGrow: 0,
                  background: ROLE[role],
                  ["--i" as string]: i,
                } as CSSProperties
              }
            />
            <span className={cn("text-[12px]", i === at ? "font-semibold text-ink" : "text-ink-3")}>{WEEKDAYS[i]}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- changing it

const PHONE = "(max-width: 639px)";

/** True on a phone-width screen (under 640px), kept up to date as the window changes. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/** A quiet text button for the secondary job that undoes something (Remove, Stop, Pause): never a primary. */
export function QuietButton({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press inline-flex min-h-11 cursor-pointer items-center rounded-xl border-0 bg-transparent px-2 text-[14px] font-semibold disabled:cursor-default disabled:opacity-50",
        danger ? "text-bad" : "text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Change something: an inline panel under the page's header on a desktop, a bottom sheet on a phone. Save is the one
 * primary button (disabled until something changed, via `canSave`); `remove` adds a quiet button for the job that
 * undoes, which should end in an undo toast rather than ask first.
 */
export function EditPanel({
  open,
  onClose,
  title,
  children,
  onSave,
  saveLabel = "Save",
  canSave = true,
  saving,
  remove,
  error,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSave: () => void;
  saveLabel?: string;
  canSave?: boolean;
  saving?: boolean;
  remove?: { label: string; onClick: () => void };
  error?: ReactNode;
}) {
  const phone = useIsPhone();
  const footer = (
    <>
      {error != null && <div className="text-[13px] text-bad">{error}</div>}
      <div className="flex flex-wrap-reverse items-center justify-between gap-2">
        {remove ? (
          <QuietButton danger onClick={remove.onClick} disabled={saving}>
            {remove.label}
          </QuietButton>
        ) : (
          <span />
        )}
        <div className={cn("flex gap-2", phone && "w-full [&>*]:flex-1")}>
          {!phone && <Button onClick={onClose}>Cancel</Button>}
          <Button primary onClick={onSave} disabled={!canSave || saving}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </>
  );
  useEffect(() => {
    if (!open || phone) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, phone, onClose]);
  if (phone)
    return (
      <Sheet open={open} onClose={onClose} title={title} footer={footer}>
        <div className="flex flex-col gap-4">{children}</div>
      </Sheet>
    );
  if (!open) return null;
  return (
    <Card aria-label={title} className="border-teal/40">
      <CardHead title={title} />
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex flex-col gap-2 border-t border-line pt-3">{footer}</div>
    </Card>
  );
}
