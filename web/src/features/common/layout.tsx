/**
 * Every signed-in page's frame (the Cockpit header): the mark, the tabs (the underline slides to the new one in 240ms
 * on the move curve, the page swaps with a short lift), today's date, and the two actions every page has: import a
 * statement and check in. On a phone the tabs move to a bar at the bottom, with a "More" sheet for the rest.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckinDialog } from "~/features/checkins/CheckinDialog";
import { dayDate } from "~/features/common/format";
import { Logo } from "~/features/common/brand";
import { Dialog } from "~/features/common/overlay";
import { Button, cn } from "~/features/common/ui";
import { AddSpending } from "~/features/spending/AddSpending";

export const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/net-worth", label: "Net worth" },
  { to: "/accounts", label: "Accounts" },
  { to: "/loan", label: "Loan" },
  { to: "/bills", label: "Bills" },
  { to: "/spending", label: "Spending" },
  { to: "/investments", label: "Investments" },
  { to: "/retirement", label: "Retirement" },
  { to: "/rules", label: "Rules" },
] as const;

const PHONE_TABS = [
  { to: "/", label: "Dashboard", icon: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" },
  { to: "/loan", label: "Loan", icon: "M3 11l9-7 9 7M5 10v10h14V10" },
  { to: "/bills", label: "Bills", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { to: "/spending", label: "Spending", icon: "M3 7h18v12H3zM3 11h18M7 15h3" },
] as const;

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

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const [checkin, setCheckin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  const now = useClock();
  const active = TABS.find((t) => (t.to === "/" ? path === "/" : path.startsWith(t.to)))?.to ?? null;
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <ActionsContext.Provider value={{ checkin: () => setCheckin(true), addSpending: () => setAdding(true) }}>
      <div className="min-h-screen pb-[84px] sm:pb-0">
        <header className="sticky top-0 z-30 border-b border-line bg-tile">
          <div className="mx-auto flex h-14 max-w-[1360px] items-center gap-5 px-4 sm:h-[60px] sm:px-7">
            <Link
              to="/"
              className="flex flex-none items-center text-ink no-underline"
              aria-label="WheresMyMoney, dashboard"
            >
              <Logo compact />
            </Link>
            <TabNav active={active} />
            <div className="ml-auto flex flex-none items-center gap-2">
              <span className="mono mr-2 hidden text-[11px] tracking-[0.04em] whitespace-nowrap text-ink-3 xl:inline">
                {dayDate(iso).toUpperCase()} · {time}
              </span>
              <Link
                to="/settings"
                title="Settings"
                aria-label="Settings"
                className={cn(
                  "press hidden size-10 items-center justify-center rounded-lg no-underline hover:bg-raised hover:text-ink sm:inline-flex",
                  path.startsWith("/settings") ? "text-teal" : "text-ink-3",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                  <circle cx="16" cy="7" r="2" />
                  <circle cx="10" cy="17" r="2" />
                </svg>
              </Link>
              <Button className="hidden whitespace-nowrap sm:inline-flex" onClick={() => navigate({ to: "/import" })}>
                Import CSV
              </Button>
              <Button primary className="hidden whitespace-nowrap sm:inline-flex" onClick={() => setCheckin(true)}>
                Check in
              </Button>
              <button
                type="button"
                aria-label="Add spending"
                onClick={() => setAdding(true)}
                className="press flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-teal text-page sm:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </header>
        <main
          key={active ?? path}
          className="screen mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pt-6 pb-14 sm:px-7"
        >
          {children}
        </main>
        <PhoneTabs path={path} onMore={() => setMore(true)} />
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
      <Dialog open={more} onClose={() => setMore(false)} labelledBy="more-h">
        <div className="flex flex-col gap-1 p-5">
          <h2 id="more-h" className="m-0 mb-2 text-lg font-semibold">
            More
          </h2>
          <Button primary className="mb-2 min-h-12" onClick={() => (setMore(false), setCheckin(true))}>
            Check in balances
          </Button>
          {[
            ...TABS.filter((t) => !PHONE_TABS.some((p) => p.to === t.to)),
            { to: "/import", label: "Import a statement" },
            { to: "/settings", label: "Settings" },
          ].map((t) => (
            <Link
              key={t.to}
              to={t.to}
              onClick={() => setMore(false)}
              className="press rounded-lg px-3 py-3 text-ink no-underline hover:bg-raised"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </Dialog>
    </ActionsContext.Provider>
  );
}

const TAB_CLASS =
  "inline-flex h-full items-center px-2.5 text-[13.5px] font-medium tracking-[-0.005em] whitespace-nowrap no-underline transition-[color] duration-150";

/**
 * The tabs, with an underline that slides to the one that's on. They stay on one line: the tabs that don't fit go,
 * last first, into a "More" menu at the end (which takes the underline when the page you're on is in it).
 */
function TabNav({ active }: { active: string | null }) {
  const nav = useRef<HTMLElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<number>(TABS.length);
  const [open, setOpen] = useState(false);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  // How many tabs fit, from the widths of an invisible copy of the row (so a hidden tab can still be measured). The
  // ruler holds each tab, then the More button with each label it can show: "More", or the page you're on when it's
  // one of the hidden ones, so a long name ("Investments") still has room.
  useLayoutEffect(() => {
    const el = nav.current;
    const r = ruler.current;
    if (!el || !r) return;
    const fit = () => {
      const widths = [...r.children].map((c) => (c as HTMLElement).offsetWidth);
      const tabs = widths.slice(0, TABS.length);
      const mores = widths.slice(TABS.length);
      const at = TABS.findIndex((t) => t.to === active);
      const room = el.clientWidth;
      if (tabs.reduce((a, b) => a + b, 0) <= room) return setShown(TABS.length);
      let n = TABS.length - 1;
      const needs = (k: number) =>
        tabs.slice(0, k).reduce((a, b) => a + b, 0) + Math.max(mores[0], at >= k ? mores[at + 1] : 0);
      while (n > 0 && needs(n) > room) n--;
      setShown(n);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [active]);

  const hidden = TABS.slice(shown);
  const inMore = hidden.some((t) => t.to === active);

  useLayoutEffect(() => {
    const measure = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-to="${inMore ? "more" : active}"]`);
      const box = nav.current?.getBoundingClientRect();
      const r = el?.getBoundingClientRect();
      setBar(box && r ? { left: r.left - box.left + 10, width: r.width - 20 } : null);
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [active, inMore, shown]);

  // The menu closes on a click elsewhere, Escape, or going to a page.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !nav.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <nav ref={nav} aria-label="Main" className="relative hidden h-full min-w-0 flex-1 sm:flex">
      <div ref={ruler} aria-hidden className="pointer-events-none invisible absolute flex h-0 overflow-hidden">
        {TABS.map((t) => (
          <span key={t.to} className={TAB_CLASS}>
            {t.label}
          </span>
        ))}
        {["More", ...TABS.map((t) => t.label)].map((label) => (
          <span key={label} className={cn(TAB_CLASS, "gap-1")}>
            {label} <Chevron />
          </span>
        ))}
      </div>
      {TABS.slice(0, shown).map((t) => (
        <Link
          key={t.to}
          to={t.to}
          data-to={t.to}
          aria-current={active === t.to ? "page" : undefined}
          className={cn(TAB_CLASS, active === t.to ? "text-ink" : "text-ink-3 hover:text-ink-2")}
        >
          {t.label}
        </Link>
      ))}
      {hidden.length > 0 && (
        <div className="relative h-full">
          <button
            type="button"
            data-to="more"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              TAB_CLASS,
              "cursor-pointer gap-1 border-0 bg-transparent",
              inMore || open ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {inMore ? hidden.find((t) => t.to === active)?.label : "More"}
            <Chevron open={open} />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute top-[calc(100%-6px)] left-0 z-40 flex min-w-44 animate-fade flex-col rounded-[10px] border border-line bg-tile p-1 shadow-[0_12px_32px_rgb(0_0_0/0.45)]"
            >
              {hidden.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  role="menuitem"
                  aria-current={active === t.to ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "press rounded-md px-3 py-2 text-[13.5px] font-medium no-underline hover:bg-raised",
                    active === t.to ? "text-teal" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {bar && (
        <span
          aria-hidden
          className="absolute bottom-0 h-0.5 rounded-full bg-teal transition-[left,width] duration-[240ms] ease-[var(--ease-move)]"
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </nav>
  );
}

function Chevron({ open = false }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("transition-transform duration-150", open && "rotate-180")}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PhoneTabs({ path, onMore }: { path: string; onMore: () => void }) {
  const idx = PHONE_TABS.findIndex((t) => (t.to === "/" ? path === "/" : path.startsWith(t.to)));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-tile px-1.5 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)] sm:hidden"
    >
      <span
        aria-hidden
        className="absolute top-1.5 h-[50px] rounded-[10px] bg-teal/10 transition-[left,opacity] duration-300 ease-[var(--ease-move)]"
        style={{
          width: "calc((100% - 12px) / 5)",
          left: `calc(6px + ${Math.max(idx, 0)} * (100% - 12px) / 5)`,
          opacity: idx < 0 ? 0 : 1,
        }}
      />
      {PHONE_TABS.map((t, i) => (
        <Link
          key={t.to}
          to={t.to}
          className={cn(
            "relative z-[1] flex min-h-[50px] flex-1 flex-col items-center justify-center gap-[3px] text-xs font-medium no-underline",
            i === idx ? "text-teal" : "text-ink-3",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d={t.icon} />
          </svg>
          {t.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={onMore}
        className="relative z-[1] flex min-h-[50px] flex-1 cursor-pointer flex-col items-center justify-center gap-[3px] border-0 bg-transparent text-xs font-medium text-ink-3"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
        More
      </button>
    </nav>
  );
}
