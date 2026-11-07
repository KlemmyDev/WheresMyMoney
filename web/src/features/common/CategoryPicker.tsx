/**
 * Choosing a transaction's category: a chip that opens a searchable list, grouped by what a category counts as
 * (spending, bills, money in, between accounts), with the suggestion and the household's recent choices on top.
 *
 * Typing filters the list (a letter typed on the closed chip opens it with that letter); arrows move, Enter picks,
 * Escape closes. A name that isn't a category yet can be added from the list, as spending, a bill, money in or a
 * transfer. Given a `merchant`, a switch at the foot says whether the choice is remembered for it (remembered
 * between uses).
 *
 * The list floats over the page (so a table's scrolling edge can't clip it), under the chip or above it when
 * there's more room there; on a phone it's a sheet from the bottom.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { apiSend, errorMessage } from "~/features/common/api";
import type { Category } from "~/features/common/types";
import { cn } from "~/features/common/ui";

export const KINDS = [
  { kind: "spending", label: "Spending", colour: "var(--color-spending)" },
  { kind: "bills", label: "Bills", colour: "var(--color-bills)" },
  { kind: "income", label: "Money in", colour: "var(--color-good)" },
  { kind: "transfer", label: "Between accounts", colour: "var(--color-track)" },
] as const;

const COLOUR: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.kind, k.colour]));
const RECENT_KEY = "wmm.category.recent";
const REMEMBER_KEY = "wmm.category.remember";
const RECENT_MAX = 5;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the picker works without it.
  }
}

/** A category's colour mark: its kind's colour. */
export function KindDot({ kind, className }: { kind?: string | null; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-[3px]", className)}
      style={{ background: kind ? (COLOUR[kind] ?? "var(--color-track)") : "transparent" }}
    />
  );
}

type Option = { type: "category"; c: Category; section: string } | { type: "add"; name: string } | { type: "clear" };

export function CategoryPicker({
  value,
  categories,
  onChange,
  label,
  suggested,
  merchant,
  kinds,
  allowClear = true,
  placeholder = "Choose",
  className,
  disabled,
}: {
  value: number | null | undefined;
  categories: Category[];
  /** The category chosen (null: not sorted), and whether to remember it for the merchant. */
  onChange: (id: number | null, opts: { remember: boolean }) => void;
  /** What a screen reader calls it: "Category for Woolworths". */
  label: string;
  /** A suggested category, shown on the chip until one is chosen and first in the list. */
  suggested?: number | null;
  /** The merchant, to offer remembering the choice for it. */
  merchant?: string | null;
  /** Only these kinds of category (spending only, for spending typed in). */
  kinds?: readonly string[];
  allowClear?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remember, setRemember] = useState(() => load(REMEMBER_KEY, true));
  const [addKind, setAddKind] = useState<string>(kinds?.[0] ?? "spending");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; phone: boolean }>();
  const id = useId();
  const qc = useQueryClient();

  const usable = useMemo(() => categories.filter((c) => !kinds || kinds.includes(c.kind)), [categories, kinds]);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const current = value != null ? byId.get(value) : undefined;
  const suggestion = value == null && suggested != null ? byId.get(suggested) : undefined;

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Option[] = [];
    if (!q) {
      const top = new Set<number>();
      const s = suggested != null ? usable.find((c) => c.id === suggested) : undefined;
      if (s) {
        out.push({ type: "category", c: s, section: "Suggested" });
        top.add(s.id);
      }
      for (const rid of load<number[]>(RECENT_KEY, [])) {
        const c = usable.find((x) => x.id === rid);
        if (c && !top.has(c.id)) {
          out.push({ type: "category", c, section: "Recent" });
          top.add(c.id);
        }
      }
    }
    for (const k of KINDS) {
      for (const c of usable) {
        if (c.kind !== k.kind) continue;
        if (q && !c.name.toLowerCase().includes(q) && !k.label.toLowerCase().startsWith(q)) continue;
        out.push({ type: "category", c, section: k.label });
      }
    }
    if (q && !categories.some((c) => c.name.toLowerCase() === q)) out.push({ type: "add", name: query.trim() });
    if (!q && allowClear && value != null) out.push({ type: "clear" });
    return out;
  }, [query, usable, categories, suggested, allowClear, value]);

  const place = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const phone = window.innerWidth < 640;
    const width = Math.max(r.width, 288);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom;
    setPos(
      below >= 360 || below >= r.top
        ? { left, top: r.bottom + 6, width, phone }
        : { left, bottom: window.innerHeight - r.top + 6, width, phone },
    );
  };

  const show = (q = "") => {
    if (disabled) return;
    place();
    setQuery(q);
    const firstPick = q
      ? 0
      : Math.max(
          0,
          options.findIndex((o) => o.type === "category" && o.c.id === value),
        );
    setActive(firstPick);
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const move = () => place();
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (cid: number | null) => {
    if (cid != null)
      save(RECENT_KEY, [cid, ...load<number[]>(RECENT_KEY, []).filter((x) => x !== cid)].slice(0, RECENT_MAX));
    onChange(cid, { remember: !!merchant && remember });
    close();
  };

  const add = useMutation({
    mutationFn: (name: string) => apiSend<Category>("POST", "categories", { name, kind: addKind, budget: null }),
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: ["categories"] });
      pick(c.id);
    },
  });

  const choose = (o: Option | undefined) => {
    if (!o) return;
    if (o.type === "category") pick(o.c.id);
    else if (o.type === "clear") pick(null);
    else add.mutate(o.name);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home") {
      setActive(0);
    } else if (e.key === "End") {
      setActive(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const shown = current ?? suggestion;
  let lastSection = "";

  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${current?.name ?? (suggestion ? `suggested ${suggestion.name}` : "not sorted")}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            show(e.key);
          } else if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            show();
          }
        }}
        className={cn(
          "press inline-flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-left text-xs disabled:cursor-default disabled:opacity-50",
          current
            ? "border-line bg-raised text-ink hover:border-ink-3"
            : suggestion
              ? "border-dashed border-ink-3/60 bg-transparent text-ink-2 hover:border-ink-2"
              : "border-warn/70 bg-warn/10 text-warn hover:bg-warn/15",
          open && "border-teal",
          className,
        )}
      >
        <KindDot kind={shown?.kind} className={cn(!current && suggestion && "opacity-60")} />
        <span className="min-w-0 flex-1 truncate">
          {current ? current.name : suggestion ? suggestion.name : placeholder}
        </span>
        {!current && suggestion && <span className="mono text-[10px] tracking-wide text-ink-3">SUGGESTED</span>}
        <svg aria-hidden viewBox="0 0 10 6" className="h-1.5 w-2.5 shrink-0 opacity-60">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {pos.phone && <div className="scrim-in fixed inset-0 z-40 bg-black/55" onClick={() => close()} />}
            <div
              ref={panel}
              role="dialog"
              aria-label={label}
              className={cn(
                "fixed z-50 flex flex-col overflow-hidden border border-line bg-tile shadow-[0_18px_50px_rgba(0,0,0,.55)]",
                pos.phone
                  ? "sheet-in inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl"
                  : "reveal max-h-[min(420px,70vh)] rounded-xl",
              )}
              style={pos.phone ? undefined : { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
            >
              <div className="border-b border-line p-2">
                <input
                  ref={input}
                  role="combobox"
                  aria-expanded
                  aria-controls={`${id}-list`}
                  aria-activedescendant={options[active] ? `${id}-o${active}` : undefined}
                  aria-autocomplete="list"
                  aria-label="Find or add a category"
                  placeholder="Find or add a category"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  className="min-h-9 w-full rounded-md border border-line bg-raised px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-teal focus:outline-none"
                />
              </div>
              <div
                ref={list}
                id={`${id}-list`}
                role="listbox"
                aria-label={label}
                className="min-h-0 flex-1 overflow-y-auto py-1"
              >
                {options.map((o, i) => {
                  const header = o.type === "category" && o.section !== lastSection ? (lastSection = o.section) : null;
                  const on = i === active;
                  return (
                    <div key={o.type === "category" ? `${o.section}-${o.c.id}` : o.type}>
                      {header && (
                        <div className="tt px-3 pt-2.5 pb-1" aria-hidden>
                          {header}
                        </div>
                      )}
                      {o.type === "clear" && <div className="mx-3 my-1 border-t border-line" />}
                      <div
                        id={`${id}-o${i}`}
                        data-i={i}
                        role="option"
                        aria-selected={o.type === "category" ? o.c.id === value : false}
                        onMouseMove={() => setActive(i)}
                        onClick={() => choose(o)}
                        className={cn(
                          "mx-1 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px]",
                          on ? "bg-raised text-ink" : "text-ink-2",
                        )}
                      >
                        {o.type === "category" ? (
                          <>
                            <KindDot kind={o.c.kind} />
                            <span className="min-w-0 flex-1 truncate">{o.c.name}</span>
                            {o.c.id === value && (
                              <svg aria-hidden viewBox="0 0 12 10" className="h-2.5 w-3 text-teal">
                                <path d="M1 5l3.5 3.5L11 1" fill="none" stroke="currentColor" strokeWidth="1.8" />
                              </svg>
                            )}
                          </>
                        ) : o.type === "clear" ? (
                          <span className="text-ink-3">Not sorted</span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-teal">+ Add</span> “{o.name}”
                            {add.isPending && <span className="text-ink-3"> · adding…</span>}
                          </span>
                        )}
                      </div>
                      {o.type === "add" && (
                        <div role="group" aria-label="Add it as" className="mx-3 mt-1 mb-2 flex flex-wrap gap-1">
                          {KINDS.filter((k) => !kinds || kinds.includes(k.kind)).map((k) => (
                            <button
                              key={k.kind}
                              type="button"
                              aria-pressed={addKind === k.kind}
                              onClick={() => setAddKind(k.kind)}
                              className={cn(
                                "press inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px]",
                                addKind === k.kind ? "border-teal text-ink" : "border-line text-ink-3",
                              )}
                            >
                              <KindDot kind={k.kind} />
                              {k.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!options.length && <div className="px-3 py-3 text-[13px] text-ink-3">No categories match.</div>}
                {add.isError && <div className="px-3 py-2 text-xs text-bad">{errorMessage(add.error)}</div>}
              </div>
              {merchant && (
                <label className="flex cursor-pointer items-center gap-2.5 border-t border-line px-3 py-2.5 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => {
                      setRemember(e.target.checked);
                      save(REMEMBER_KEY, e.target.checked);
                    }}
                    className="accent-[var(--color-teal)]"
                  />
                  <span className="min-w-0 truncate">
                    Always use it for <span className="mono text-ink">{merchant}</span>
                  </span>
                </label>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
