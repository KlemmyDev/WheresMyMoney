/**
 * The Nightfall design system: the pieces every page builds from, so the whole app looks and behaves the same.
 * See them all, in dark and light, on /design. The older building blocks (Tile, Button, Pill, Switch, Segmented,
 * Input) live in ui.tsx and are styled to match; what's here is what the uplift added.
 *
 * Rules the components keep for you:
 * - Every tap target is at least 44px (sheets, chips, icon buttons, keypad keys).
 * - Striped fill means it happened; hatched means it's likely (a forecast).
 * - Icon chips carry the role colour: offset blue, bills amber, spending pink, savings green, invest cyan.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { aboveKeyboard, useKeyboard } from "~/features/common/keyboard";
import { createPortal } from "react-dom";
import { Chip, type Glyph, type Tone } from "~/features/common/icons";
import { usePresence } from "~/features/common/motion";
import { cn } from "~/features/common/ui";

/** Role colours as CSS values, for charts and fills. */
export const ROLE = {
  accent: "var(--color-accent-fill)",
  offset: "var(--color-offset-fill)",
  bills: "var(--color-bills-fill)",
  spending: "var(--color-spending-fill)",
  savings: "var(--color-savings-fill)",
  invest: "var(--color-invest)",
  bad: "var(--color-bad)",
  ink: "var(--color-ink-3)",
} as const;
export type Role = keyof typeof ROLE;

/** A card. `lit` gives the hero's gradient edge; `tint` washes it with a role colour. */
export function Card({
  children,
  className,
  lit,
  tint,
  as = "section",
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  lit?: boolean;
  tint?: Role;
  as?: "section" | "div" | "article";
  style?: CSSProperties;
} & Record<string, unknown>) {
  const Tag = as;
  return (
    <Tag
      {...rest}
      className={cn(
        "relative flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-tile p-[18px] shadow-[var(--shadow-card)] sm:p-[22px]",
        lit && "lit",
        className,
      )}
      style={{
        ...(tint
          ? {
              background: `radial-gradient(520px 300px at 0% 0%, color-mix(in srgb, ${ROLE[tint]} 16%, transparent), transparent 70%), var(--color-tile)`,
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/** A small capitals label over a figure or a section. */
export function Eyebrow({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div
      id={id}
      className={cn("text-[11px] leading-4 font-semibold tracking-[0.09em] text-ink-3 uppercase", className)}
    >
      {children}
    </div>
  );
}

/** A card's heading row: title on the left, an optional action or note on the right. */
export function CardHead({ title, right, id }: { title: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="m-0 flex items-center gap-2.5 text-[17px] leading-6 font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {right}
    </div>
  );
}

/** The big figure on a hero card. */
export function BigNumber({
  children,
  size = "lg",
  className,
}: {
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-semibold tracking-[-0.045em] tabular-nums",
        size === "xl"
          ? "text-[44px] leading-[48px] sm:text-[60px] sm:leading-[64px]"
          : size === "lg"
            ? "text-[36px] leading-[40px] sm:text-[48px] sm:leading-[54px]"
            : "text-[28px] leading-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A tinted tile with a label and a figure (the stat row). */
export function Stat({
  label,
  value,
  note,
  role = "accent",
  noteColor,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  role?: Role;
  noteColor?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 rounded-2xl border p-3.5"
      style={{
        borderColor: `color-mix(in srgb, ${ROLE[role]} 40%, var(--color-line))`,
        background: `color-mix(in srgb, ${ROLE[role]} 9%, var(--color-tile))`,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <span className="num text-[20px] leading-[26px] text-ink">{value}</span>
      {note != null && (
        <span className="text-[13px] leading-[18px] text-ink-3" style={noteColor ? { color: noteColor } : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}

export type Segment = { value: number; role?: Role; color?: string; likely?: boolean; label?: string };

/** A horizontal bar of segments (of `max`): striped where it happened, hatched where it's likely. */
export function Bar({
  segments,
  max,
  height = 12,
  marker,
  label,
}: {
  segments: Segment[];
  max: number;
  height?: number;
  marker?: number;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative flex overflow-visible rounded-full bg-raised"
      style={{ height }}
    >
      <div className="flex w-full overflow-hidden rounded-full">
        {segments.map((s, i) => {
          const c = s.color ?? ROLE[s.role ?? "accent"];
          return (
            <span
              key={i}
              className={s.likely ? "hatched" : "striped"}
              style={{
                width: `${Math.max(0, (s.value / max) * 100)}%`,
                backgroundColor: s.likely ? "transparent" : c,
                ["--c" as string]: c,
              }}
            />
          );
        })}
      </div>
      {marker != null && (
        <span
          aria-hidden
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink"
          style={{ left: `${(marker / max) * 100}%` }}
        />
      )}
    </div>
  );
}

/** A progress ring (goals, coverage). `extra` draws a lighter added segment after `value`. */
export function Ring({
  value,
  extra = 0,
  size = 76,
  role = "accent",
  children,
  label,
}: {
  value: number;
  extra?: number;
  size?: number;
  role?: Role;
  children?: ReactNode;
  label: string;
}) {
  const c = ROLE[role];
  return (
    <div role="img" aria-label={label} className="relative flex-none" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" width={size} height={size} className="-rotate-90">
        <circle cx="21" cy="21" r="16" fill="none" stroke="var(--color-raised)" strokeWidth="4" />
        <circle
          cx="21"
          cy="21"
          r="16"
          fill="none"
          stroke={c}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
        />
        {extra > 0 && (
          <circle
            cx="21"
            cy="21"
            r="16"
            fill="none"
            stroke={c}
            strokeOpacity={0.45}
            strokeWidth="4"
            pathLength={100}
            strokeDasharray={`${extra} 100`}
            strokeDashoffset={-value}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}

/** A round icon button with a 44px target. */
export function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "press inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-tile-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** A tappable chip (filters, amounts, choices). Pass `g` for an icon. */
export function ChoiceChip({
  children,
  pressed,
  onClick,
  g,
  tone,
  role,
}: {
  children: ReactNode;
  pressed: boolean;
  onClick: () => void;
  g?: Glyph;
  tone?: Tone;
  role?: Role;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "chip-host press inline-flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-full border text-[14px] font-semibold whitespace-nowrap",
        g ? "pr-4 pl-1.5" : "px-4",
        pressed ? "text-ink" : "border-line-2 bg-transparent text-ink-2",
      )}
      style={
        pressed
          ? {
              borderColor: ROLE[role ?? "accent"],
              background: `color-mix(in srgb, ${ROLE[role ?? "accent"]} 14%, var(--color-tile))`,
            }
          : undefined
      }
    >
      {g && <Chip g={g} tone={tone} size="sm" round />}
      {children}
    </button>
  );
}

/** A list row with an icon chip, two lines of text and something on the right. A link or button when given one. */
export function Row({
  g,
  tone,
  title,
  sub,
  right,
  onClick,
  href,
}: {
  g?: Glyph;
  tone?: Tone;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {g && <Chip g={g} tone={tone} size="lg" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[22px] text-ink">{title}</span>
        {sub != null && <span className="block truncate text-[13px] leading-[18px] text-ink-3">{sub}</span>}
      </span>
      {right}
    </>
  );
  const cls =
    "chip-host flex min-h-16 w-full items-center gap-3 rounded-2xl px-2.5 text-left text-ink no-underline transition-colors duration-150";
  if (href)
    return (
      <a href={href} className={cn(cls, "press hover:bg-tile-2")}>
        {inner}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cls, "press cursor-pointer border-0 bg-transparent hover:bg-tile-2")}
      >
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/** A message across the top of a page: away from home, check-in overdue, a rule that didn't add up. */
export function Banner({
  g,
  tone = "bills",
  title,
  children,
  action,
}: {
  g: Glyph;
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3.5 rounded-[20px] border border-line bg-tile px-4 py-3.5 sm:flex-nowrap"
    >
      <Chip g={g} tone={tone} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {children && <span className="block text-[13px] text-ink-3">{children}</span>}
      </span>
      {action}
    </div>
  );
}

/** Nothing here yet: what this place is for, and the one next step. */
export function EmptyState({
  g,
  tone,
  title,
  children,
  action,
}: {
  g: Glyph;
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[22px] border border-dashed border-line-2 px-6 py-9 text-center">
      <Chip g={g} tone={tone} size="xl" />
      <div className="text-[17px] font-semibold">{title}</div>
      {children && <div className="max-w-[380px] text-[13px] text-ink-3">{children}</div>}
      {action}
    </div>
  );
}

/** A number pad for money: big keys in thumb reach, two decimals at most. */
export function Keypad({
  value,
  onChange,
  maxDigits = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  maxDigits?: number;
}) {
  const press = (k: string) => {
    let cur = value;
    if (k === "del") cur = cur.slice(0, -1);
    else if (k === ".") {
      if (!cur.includes(".")) cur = (cur || "0") + ".";
    } else {
      const dec = cur.split(".")[1];
      if (dec != null && dec.length >= 2) return;
      if (cur.replace(".", "").length >= maxDigits) return;
      cur = cur === "0" ? k : cur + k;
    }
    onChange(cur);
  };
  return (
    <div role="group" aria-label="Number pad" className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === "del" ? "Delete" : k === "." ? "Decimal point" : k}
          onClick={() => press(k)}
          className={cn(
            "press flex h-[54px] cursor-pointer items-center justify-center rounded-2xl border-0 text-[24px] font-medium tabular-nums",
            k === "." || k === "del"
              ? "bg-transparent text-ink-2"
              : "bg-tile-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line)] active:bg-raised",
          )}
        >
          {k === "del" ? (
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 6h11v12H9l-6-6z" />
              <path d="M13 10l4 4M17 10l-4 4" />
            </svg>
          ) : (
            k
          )}
        </button>
      ))}
    </div>
  );
}

/** For a flow inside a Sheet: put the ref on its root, and the sheet scrolls back to the top when `step` changes. */
export function useSheetTop<T extends HTMLElement = HTMLDivElement>(step: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.parentElement?.scrollTo({ top: 0 });
  }, [step]);
  return ref;
}

/**
 * A bottom sheet: handle, title and close, then its content, with an optional pinned footer. Escape, the handle and
 * the scrim close it. `phoneOnly` hides it from 640px up (for menus that are hover cards on a desktop).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  phoneOnly,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  phoneOnly?: boolean;
}) {
  const { mounted, leaving } = usePresence(open);
  // On a phone the keyboard covers the bottom of the page: the sheet sits above it and fits in what's left.
  const kb = useKeyboard(open);
  const phoneKb = kb.inset && typeof window !== "undefined" && window.innerWidth < 640 ? aboveKeyboard(kb) : undefined;
  useEffect(() => {
    if (!kb.inset) return;
    // Keep the field being typed in on screen once the sheet has moved.
    const t = setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.closest("[role=dialog]")) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [kb.inset]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-40", phoneOnly && "sm:hidden")}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={cn(
          "absolute inset-0 w-full cursor-pointer border-0 bg-black/60",
          leaving ? "scrim-out" : "scrim-in",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "dialog-panel absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-[30px] border-t border-line-2 bg-tile",
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(92vw,560px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[26px] sm:border",
          leaving ? "leaving" : "entering",
        )}
        style={phoneKb}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="relative h-6 w-full flex-none cursor-pointer border-0 bg-transparent after:absolute after:top-[9px] after:left-1/2 after:h-[5px] after:w-10 after:-translate-x-1/2 after:rounded-full after:bg-line-2 after:content-[''] sm:hidden"
        />
        <div className="flex min-h-11 items-center justify-between gap-3 pr-4 pb-2 pl-5 sm:pt-3">
          <h2 className="m-0 text-[19px] font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-2"
          >
            <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-raised text-[13px]">
              ✕
            </span>
          </button>
        </div>
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? (
          <div className="flex flex-none flex-col gap-2.5 border-t border-line px-5 pt-2.5 pb-[max(env(safe-area-inset-bottom),28px)]">
            {footer}
          </div>
        ) : (
          <div className="h-[max(env(safe-area-inset-bottom),20px)] flex-none" />
        )}
      </div>
    </div>,
    document.body,
  );
}
