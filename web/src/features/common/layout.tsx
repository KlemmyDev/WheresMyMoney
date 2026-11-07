/**
 * Every signed-in page's frame: the two-tier header (direction D on the navigation canvas). The pages sit in four
 * sections (Overview, Money, Future, Manage). The top row picks a section, the row under it picks a page in that
 * section, and each section remembers the page you were last on, so going back to Money returns you to Loan.
 *
 * Motion: the section underline and the page pill slide to the new one in 240ms on the move curve; changing section
 * slides the page row in from the side you moved towards (300ms); the page itself swaps with the short lift. On a
 * phone the sections move to a bar at the bottom (thumb reach) and the pages become chips under the title.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckinDialog } from "~/features/checkins/CheckinDialog";
import { dayDate } from "~/features/common/format";
import { Logo, Mark } from "~/features/common/brand";
import { useReducedMotion } from "~/features/common/motion";
import { Button, cn } from "~/features/common/ui";
import { AddSpending } from "~/features/spending/AddSpending";

type Page = { to: string; label: string; soon?: true; also?: readonly string[] };
type Section = { id: string; label: string; hint: string; icon: string; pages: readonly Page[] };

export const SECTIONS: readonly Section[] = [
  {
    id: "overview",
    label: "Overview",
    hint: "Today, and over time",
    icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z",
    pages: [
      { to: "/", label: "Dashboard" },
      { to: "/net-worth", label: "Net worth", soon: true },
    ],
  },
  {
    id: "money",
    label: "Money",
    hint: "Where it is, what's due, where it went",
    icon: "M3 7h18v12H3zM16 13h2M3 7l3-3h12l3 3",
    pages: [
      { to: "/accounts", label: "Accounts" },
      { to: "/loan", label: "Loan" },
      { to: "/bills", label: "Bills" },
      // "All transactions" is reached from Spending, so it keeps Spending lit.
      { to: "/spending", label: "Spending", also: ["/transactions"] },
    ],
  },
  {
    id: "future",
    label: "Future",
    hint: "Coming in phases 3 and 4",
    icon: "M5 20v-6M12 20V9M19 20V4",
    pages: [
      { to: "/investments", label: "Investments", soon: true },
      { to: "/retirement", label: "Retirement", soon: true },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    hint: "How the app sorts and stores",
    icon: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 1 0 4a2 2 0 1 1 0-4M10 15a2 2 0 1 1 0 4a2 2 0 1 1 0-4",
    pages: [
      { to: "/rules", label: "Rules" },
      { to: "/import", label: "Import" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

const on = (path: string, to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`));

/** The section and page a path belongs to, or nulls for a page outside the menu. */
function locate(path: string): { section: number; page: Page | null } {
  for (const [i, s] of SECTIONS.entries())
    for (const p of s.pages) if (on(path, p.to) || p.also?.some((a) => on(path, a))) return { section: i, page: p };
  return { section: -1, page: null };
}

type Actions = { checkin: () => void; addSpending: () => void };
const ActionsContext = createContext<Actions>({ checkin: () => {}, addSpending: () => {} });
export const useActions = () => useContext(ActionsContext);

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Each section's last page, for this visit (sessionStorage, so a reload keeps it but a new tab starts fresh).
const MEMO_KEY = "wmm:nav-memo";
function readMemo(): Record<string, string> {
  try {
    if (typeof window === "undefined") return {};
    return JSON.parse(sessionStorage.getItem(MEMO_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Where each section's link goes: the page you were last on there, else its first page. */
function useSectionTargets(section: number, page: Page | null) {
  const [memo, setMemo] = useState(readMemo);
  // Going to a page updates its section's memory as part of the same render (no effect round-trip).
  const id = section >= 0 ? SECTIONS[section].id : null;
  if (id && page && memo[id] !== page.to) setMemo({ ...memo, [id]: page.to });
  useEffect(() => {
    try {
      sessionStorage.setItem(MEMO_KEY, JSON.stringify(memo));
    } catch {
      // Private mode: the memory lasts until the page reloads.
    }
  }, [memo]);
  return SECTIONS.map((s) => memo[s.id] ?? s.pages[0].to);
}

/**
 * Where the sliding marker sits under the element in `box` whose data-key is `active`: its left and width, measured
 * (so it follows real label widths and fonts), and whether it has been placed before (the first placement doesn't
 * slide in from nowhere).
 */
function useMarker(box: RefObject<HTMLElement | null>, active: string | null, inset = 0) {
  const [bar, setBar] = useState<{ left: number; width: number; placed: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const t = active ? el.querySelector<HTMLElement>(`[data-key="${active}"]`) : null;
      if (!t) return setBar(null);
      const b = el.getBoundingClientRect();
      const r = t.getBoundingClientRect();
      const left = r.left - b.left + el.scrollLeft + inset;
      const width = r.width - inset * 2;
      setBar((prev) =>
        prev && prev.left === left && prev.width === width ? prev : { left, width, placed: prev !== null },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [box, active, inset]);
  return bar;
}

/** The side the page row slides in from: the right when you moved to a later section, the left for an earlier one. */
function useDirection(section: number) {
  const [seen, setSeen] = useState({ section, dir: "" });
  if (seen.section !== section) setSeen({ section, dir: section > seen.section ? "slide-r" : "slide-l" });
  return seen.section !== section ? "" : seen.dir;
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const [checkin, setCheckin] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useClock();
  const { section, page } = locate(path);
  const targets = useSectionTargets(section, page);
  const dir = useDirection(section);
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const current = SECTIONS[section];

  return (
    <ActionsContext.Provider value={{ checkin: () => setCheckin(true), addSpending: () => setAdding(true) }}>
      <div className="min-h-screen pb-[88px] sm:pb-0">
        <header className="sticky top-0 z-30">
          {/* Desktop: sections, then that section's pages. */}
          <div className="hidden border-b border-line bg-tile sm:block">
            <div className="mx-auto flex h-[60px] max-w-[1360px] items-center gap-6 px-7">
              <Link
                to="/"
                className="flex flex-none items-center text-ink no-underline"
                aria-label="WheresMyMoney, dashboard"
              >
                <Logo compact />
              </Link>
              <SectionTabs section={section} targets={targets} />
              <div className="ml-auto flex flex-none items-center gap-2">
                <span className="mono mr-2 hidden text-[11px] tracking-[0.04em] whitespace-nowrap text-ink-3 xl:inline">
                  {dayDate(iso).toUpperCase()} · {time}
                </span>
                <Button className="hidden whitespace-nowrap md:inline-flex" onClick={() => navigate({ to: "/import" })}>
                  Import CSV
                </Button>
                <Button primary className="whitespace-nowrap" onClick={() => setCheckin(true)}>
                  Check in
                </Button>
              </div>
            </div>
          </div>
          {current && (
            <div className="hidden overflow-hidden border-b border-line bg-page/90 backdrop-blur-md sm:block">
              <div key={current.id} className={cn("mx-auto flex h-12 max-w-[1360px] items-center gap-4 px-7", dir)}>
                <PageRow section={current} path={path} />
                <span className="mono ml-auto hidden text-[10.5px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase lg:inline">
                  {current.hint}
                </span>
              </div>
            </div>
          )}

          {/* Phone: the page's name and the two actions, then the section's pages as chips. */}
          <div className="border-b border-line bg-page/90 backdrop-blur-md sm:hidden">
            <div className="flex h-14 items-center gap-2.5 px-4">
              <Link to="/" aria-label="WheresMyMoney, dashboard" className="flex flex-none">
                <Mark size={26} />
              </Link>
              <span className="min-w-0 truncate text-[17px] font-semibold">{page?.label ?? ""}</span>
              <button
                type="button"
                aria-label="Add spending"
                onClick={() => setAdding(true)}
                className="press ml-auto flex size-10 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-tile text-ink-2"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="19"
                  height="19"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setCheckin(true)}
                className="press min-h-10 flex-none cursor-pointer rounded-full border-0 bg-teal px-4 text-[13px] font-semibold text-page"
              >
                Check in
              </button>
            </div>
            {current && (
              <div key={current.id} className={cn("overflow-hidden", dir)}>
                <PhoneChips section={current} path={path} />
              </div>
            )}
          </div>
        </header>
        <main
          key={page?.to ?? path}
          className="screen mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pt-6 pb-14 sm:px-7"
        >
          {children}
        </main>
        <PhoneSections section={section} targets={targets} />
      </div>
      <CheckinDialog
        // A notification's "time for a check-in" opens it (/?checkin=1).
        open={checkin || !!search?.checkin}
        onClose={() => {
          setCheckin(false);
          if (search?.checkin) navigate({ to: path, search: {}, replace: true });
        }}
        onImport={() => {
          setCheckin(false);
          navigate({ to: "/import" });
        }}
      />
      <AddSpending open={adding} onClose={() => setAdding(false)} />
    </ActionsContext.Provider>
  );
}

function Icon({ d, size = 17, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

/** A small amber dot on a page that isn't built yet, with the words for screen readers. */
function Soon() {
  return (
    <>
      <span aria-hidden className="size-[5px] flex-none rounded-full bg-warn" />
      <span className="sr-only">(coming soon)</span>
    </>
  );
}

/** The top row: one link per section, to the page you were last on there, with an underline that slides. */
function SectionTabs({ section, targets }: { section: number; targets: string[] }) {
  const box = useRef<HTMLElement>(null);
  const active = section >= 0 ? SECTIONS[section].id : null;
  const bar = useMarker(box, active, 14);
  return (
    <nav ref={box} aria-label="Sections" className="relative flex h-full min-w-0">
      {SECTIONS.map((s, i) => (
        <Link
          key={s.id}
          to={targets[i]}
          data-key={s.id}
          activeOptions={{ exact: true }}
          activeProps={{}}
          aria-current={i === section ? "true" : undefined}
          className={cn(
            "group inline-flex h-full items-center gap-2 px-3.5 text-[14px] font-medium whitespace-nowrap no-underline transition-colors duration-150",
            i === section ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          <Icon
            d={s.icon}
            className={cn(
              "hidden transition-transform duration-[240ms] ease-[var(--ease-spring)] group-hover:-translate-y-px md:block",
              i === section && "text-teal",
            )}
          />
          {s.label}
        </Link>
      ))}
      {bar && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-px h-0.5 rounded-full bg-teal shadow-[0_0_10px_rgb(45_212_191/0.55)]",
            bar.placed && "transition-[left,width] duration-[240ms] ease-[var(--ease-move)]",
          )}
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </nav>
  );
}

/** The second row on desktop: the section's pages, with a raised pill that slides to the one you're on. */
function PageRow({ section, path }: { section: Section; path: string }) {
  const box = useRef<HTMLElement>(null);
  const active = locate(path).page?.to ?? null;
  const bar = useMarker(box, active);
  return (
    <nav ref={box} aria-label={`${section.label} pages`} className="relative flex h-[34px] min-w-0">
      {bar && (
        <span
          aria-hidden
          className={cn(
            "absolute top-0 h-[34px] rounded-[9px] bg-raised shadow-[inset_0_0_0_1px_#2c3644]",
            bar.placed && "transition-[left,width] duration-[240ms] ease-[var(--ease-move)]",
          )}
          style={{ left: bar.left, width: bar.width }}
        />
      )}
      {section.pages.map((p) => (
        <Link
          key={p.to}
          to={p.to}
          data-key={p.to}
          activeProps={{}}
          aria-current={p.to === active ? "page" : undefined}
          className={cn(
            "press relative inline-flex h-[34px] items-center gap-1.5 rounded-[9px] px-3.5 text-[13.5px] font-medium whitespace-nowrap no-underline",
            p.to === active ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {p.label}
          {p.soon && <Soon />}
        </Link>
      ))}
    </nav>
  );
}

/** The phone's page chips under the title; the row scrolls to keep the one you're on in view. */
function PhoneChips({ section, path }: { section: Section; path: string }) {
  const row = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const active = locate(path).page?.to ?? null;
  useEffect(() => {
    const r = row.current;
    const a = active ? r?.querySelector<HTMLElement>(`[data-key="${active}"]`) : null;
    if (!r || !a) return;
    const left = a.offsetLeft - 16;
    if (left < r.scrollLeft || a.offsetLeft + a.offsetWidth > r.scrollLeft + r.clientWidth)
      r.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);
  return (
    <nav
      ref={row}
      aria-label={`${section.label} pages`}
      className="no-scrollbar relative flex gap-2 overflow-x-auto px-4 pt-0.5 pb-3"
    >
      {section.pages.map((p) => (
        <Link
          key={p.to}
          to={p.to}
          data-key={p.to}
          activeProps={{}}
          aria-current={p.to === active ? "page" : undefined}
          className={cn(
            "press inline-flex min-h-[38px] flex-none items-center gap-1.5 rounded-full border px-[15px] text-[13.5px] font-medium no-underline",
            p.to === active ? "border-teal bg-teal text-page" : "border-line bg-tile text-ink-2",
          )}
        >
          {p.label}
          {p.soon && <Soon />}
        </Link>
      ))}
    </nav>
  );
}

/** The phone's bottom bar: the four sections, with a short line that slides over the one you're in. */
function PhoneSections({ section, targets }: { section: number; targets: string[] }) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-tile px-2 pb-[max(env(safe-area-inset-bottom),12px)] sm:hidden"
    >
      <span
        aria-hidden
        className="absolute -top-px h-0.5 w-10 rounded-full bg-teal shadow-[0_0_10px_rgb(45_212_191/0.55)] transition-[left,opacity] duration-300 ease-[var(--ease-move)]"
        style={{
          left: `calc(8px + ${Math.max(section, 0)} * (100% - 16px) / 4 + (100% - 16px) / 8 - 20px)`,
          opacity: section < 0 ? 0 : 1,
        }}
      />
      {SECTIONS.map((s, i) => (
        <Link
          key={s.id}
          to={targets[i]}
          activeOptions={{ exact: true }}
          activeProps={{}}
          aria-current={i === section ? "true" : undefined}
          className={cn(
            "press flex min-h-[62px] flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-medium no-underline",
            i === section ? "text-teal" : "text-ink-3",
          )}
        >
          <Icon d={s.icon} size={22} />
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
