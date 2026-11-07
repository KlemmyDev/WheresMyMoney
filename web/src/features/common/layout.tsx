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
          <div className="mx-auto flex min-h-[60px] max-w-[1360px] flex-wrap items-center gap-6 px-4 sm:px-7">
            <Link to="/" className="flex items-center gap-2.5 text-ink no-underline">
              <Logo />
            </Link>
            <TabNav active={active} />
            <div className="ml-auto flex items-center gap-3">
              <span className="mono hidden text-xs text-ink-3 lg:inline">
                {dayDate(iso).toUpperCase()} · {time}
              </span>
              <Link
                to="/settings"
                className="press hidden rounded-lg px-2 py-1.5 text-[13px] text-ink-3 no-underline hover:text-ink sm:inline"
                aria-label="Settings"
              >
                Settings
              </Link>
              <Button className="hidden sm:inline-flex" onClick={() => navigate({ to: "/import" })}>
                Import CSV
              </Button>
              <Button primary className="hidden sm:inline-flex" onClick={() => setCheckin(true)}>
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

/** The tabs, with an underline that slides to the one that's on. */
function TabNav({ active }: { active: string | null }) {
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = nav.current?.querySelector<HTMLElement>(`[data-to="${active}"]`);
      setBar(el ? { left: el.offsetLeft + 12, width: el.offsetWidth - 24 } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);
  return (
    <nav ref={nav} aria-label="Main" className="relative hidden flex-wrap self-stretch md:flex md:items-end">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          data-to={t.to}
          aria-current={active === t.to ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[60px] items-center px-3.5 font-medium no-underline transition-colors duration-150",
            active === t.to ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {t.label}
        </Link>
      ))}
      {bar && (
        <span
          aria-hidden
          className="absolute bottom-0 h-0.5 bg-teal transition-[left,width] duration-[240ms] ease-[var(--ease-move)]"
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </nav>
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
