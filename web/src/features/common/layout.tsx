/**
 * Every signed-in page's frame (Nightfall, from the uplift canvas).
 *
 * Desktop: one top bar in a card. Overview is a tab; Money, Future and Manage are tabs that open a compact card of
 * their pages (icon chip and name) on hover or click. Check in and Add transaction sit on the right.
 *
 * Phone: the same four tabs move to a floating bar at the bottom (thumb reach) with + in the middle. A tab opens its
 * card as a sheet; + opens the things you record. Every target is at least 44px.
 */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckinDialog } from "~/features/checkins/CheckinDialog";
import { Logo } from "~/features/common/brand";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { Sheet } from "~/features/common/ds";
import { Button, cn } from "~/features/common/ui";
import { NewGoalSheet } from "~/features/goals/GoalFlows";
import { AddSpending } from "~/features/spending/AddSpending";

type Page = { to: string; label: string; sub: string; g: Glyph; tone: Tone; soon?: true; also?: readonly string[] };
type Section = { id: string; label: string; g: Glyph; pages: readonly Page[] };

export const SECTIONS: readonly Section[] = [
  {
    id: "overview",
    label: "Overview",
    g: I.overview,
    pages: [
      { to: "/", label: "Overview", sub: "Today, and the month ahead", g: I.overview, tone: "grad" },
      { to: "/net-worth", label: "Net worth", sub: "Owned minus owed", g: I.networth, tone: "invest", soon: true },
    ],
  },
  {
    id: "money",
    label: "Money",
    g: I.accounts,
    pages: [
      { to: "/accounts", label: "Accounts", sub: "Four accounts and what moved them", g: I.accounts, tone: "" },
      { to: "/loan", label: "Loan and offset", sub: "What your accounts save you", g: I.loan, tone: "loan" },
      { to: "/bills", label: "Bills", sub: "What's due, and what's held", g: I.bills, tone: "bills" },
      // "All transactions" and "Sort by merchant" are reached from Spending, so they keep Spending lit.
      {
        to: "/spending",
        label: "Spending",
        sub: "This month, by category",
        g: I.spending,
        tone: "spending",
        also: ["/transactions", "/sort"],
      },
    ],
  },
  {
    id: "future",
    label: "Future",
    g: I.invest,
    pages: [
      { to: "/investments", label: "Investments", sub: "ETFs and shares", g: I.invest, tone: "invest", soon: true },
      { to: "/retirement", label: "Retirement", sub: "When you could stop", g: I.retire, tone: "savings", soon: true },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    g: I.settings,
    pages: [
      { to: "/rules", label: "Rules", sub: "Your plan for moving money", g: I.rules, tone: "neutral" },
      { to: "/import", label: "Import", sub: "Drop in a uBank CSV", g: I.import, tone: "neutral" },
      { to: "/settings", label: "Settings", sub: "Household, alerts, updates", g: I.settings, tone: "neutral" },
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

type Actions = { checkin: () => void; addSpending: () => void; newGoal: () => void };
const ActionsContext = createContext<Actions>({ checkin: () => {}, addSpending: () => {}, newGoal: () => {} });
export const useActions = () => useContext(ActionsContext);

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const navigate = useNavigate();
  const [checkin, setCheckin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [goal, setGoal] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const { section, page } = locate(path);
  // A route change closes any open sheet.
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    if (sheet) setSheet(null);
  }
  const sheetSection = SECTIONS.find((s) => s.id === sheet);

  return (
    <ActionsContext.Provider
      value={{ checkin: () => setCheckin(true), addSpending: () => setAdding(true), newGoal: () => setGoal(true) }}
    >
      <div className="min-h-screen pb-[120px] sm:pb-0">
        <header className="sticky top-0 z-30 hidden px-4 pt-4 sm:block sm:px-7">
          <div className="mx-auto flex min-h-16 max-w-[1360px] items-center gap-6 rounded-[20px] border border-line bg-tile py-2 pr-3 pl-5 shadow-[var(--shadow-card)]">
            <Link
              to="/"
              className="flex flex-none items-center text-ink no-underline"
              aria-label="WheresMyMoney, overview"
            >
              <Logo compact />
            </Link>
            <TopTabs section={section} path={path} />
            <div className="ml-auto flex flex-none items-center gap-2">
              <Button className="whitespace-nowrap" onClick={() => setCheckin(true)}>
                Check in
              </Button>
              <Button primary className="whitespace-nowrap" onClick={() => setAdding(true)}>
                Add transaction
              </Button>
            </div>
          </div>
        </header>

        {/* Phone: the page's name, with Check in where a thumb can still reach it. */}
        <header className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-2 sm:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] text-ink-3">{section >= 0 ? SECTIONS[section].label : ""}</div>
            <div className="truncate text-[22px] leading-7 font-semibold tracking-[-0.02em]">{page?.label ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={() => setCheckin(true)}
            className="press inline-flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-full border border-line bg-tile-2 px-3.5 text-[13px] font-semibold text-ink-2"
          >
            <span
              aria-hidden
              className="size-[7px] rounded-full bg-bills-fill shadow-[0_0_8px_var(--color-bills-fill)]"
            />
            Check in
          </button>
        </header>

        <main
          key={page?.to ?? path}
          className="screen mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pt-4 pb-14 sm:px-7 sm:pt-6"
        >
          {section > 0 && <SectionPages section={SECTIONS[section]} path={path} />}
          {children}
        </main>

        <PhoneBar section={section} sheet={sheet} setSheet={setSheet} />
      </div>

      <Sheet open={!!sheetSection} onClose={() => setSheet(null)} title={sheetSection?.label ?? ""} phoneOnly>
        <div className="flex flex-col gap-2">
          {sheetSection?.pages.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              activeProps={{}}
              aria-current={page?.to === p.to ? "page" : undefined}
              className="chip-host press flex min-h-16 items-center gap-3.5 rounded-[18px] border border-line bg-tile-2 px-3 text-ink no-underline aria-[current=page]:border-teal/50"
            >
              <Chip g={p.g} tone={p.tone} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-[13px] text-ink-3">{p.sub}</span>
              </span>
              {p.soon ? <SoonPill /> : <Chevron />}
            </Link>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "add"} onClose={() => setSheet(null)} title="Record something" phoneOnly>
        <div className="grid grid-cols-2 gap-2.5">
          <ActionTile
            g={I.spending}
            tone="spending"
            label="Add a spend"
            sub="Or income, or a transfer"
            onClick={() => {
              setSheet(null);
              setAdding(true);
            }}
          />
          <ActionTile
            g={I.offset}
            tone="offset"
            label="Check in"
            sub="Type what uBank shows"
            onClick={() => {
              setSheet(null);
              setCheckin(true);
            }}
          />
          <ActionTile
            g={I.bills}
            tone="bills"
            label="Pay a bill"
            sub="Mark one paid"
            onClick={() => navigate({ to: "/bills" })}
          />
          <ActionTile
            g={I.import}
            tone="neutral"
            label="Import"
            sub="A uBank statement"
            onClick={() => navigate({ to: "/import" })}
          />
          <ActionTile
            g={I.savings}
            tone="savings"
            label="New goal"
            sub="Save up for something"
            onClick={() => {
              setSheet(null);
              setGoal(true);
            }}
          />
          <ActionTile
            g={I.loan}
            tone="loan"
            label="Rate changed"
            sub="The loan's rate moved"
            onClick={() => navigate({ to: "/loan", search: { rate: 1 } })}
          />
        </div>
      </Sheet>

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
      <NewGoalSheet open={goal} onClose={() => setGoal(false)} />
    </ActionsContext.Provider>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className="flex-none text-ink-3"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SoonPill() {
  return <span className="flex-none rounded-full bg-raised px-2 py-px text-[11px] font-semibold text-ink-3">Soon</span>;
}

const TAB =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border-0 bg-transparent px-3 py-2 text-[14px] font-medium whitespace-nowrap no-underline transition-colors duration-150";

/** The desktop tabs. Overview is a link; the others open a compact card of their pages on hover or click. */
function TopTabs({ section, path }: { section: number; path: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLElement>(null);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setOpen(null);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <nav ref={box} aria-label="Sections" className="flex min-w-0 flex-1 items-center gap-1">
      <Link
        to="/"
        activeProps={{}}
        aria-current={section === 0 ? "page" : undefined}
        className={cn(TAB, section === 0 ? "font-semibold text-ink" : "text-ink-2 hover:bg-raised hover:text-ink")}
      >
        Overview
      </Link>
      {SECTIONS.slice(1).map((s, k) => {
        const i = k + 1;
        const isOpen = open === s.id;
        return (
          <div
            key={s.id}
            className="relative"
            onMouseEnter={() => setOpen(s.id)}
            onMouseLeave={() => setOpen((o) => (o === s.id ? null : o))}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-haspopup="true"
              aria-current={i === section ? "true" : undefined}
              onClick={() => setOpen(isOpen ? null : s.id)}
              className={cn(
                TAB,
                isOpen
                  ? "bg-teal/15 font-semibold text-teal"
                  : i === section
                    ? "font-semibold text-ink"
                    : "text-ink-2 hover:bg-raised hover:text-ink",
              )}
            >
              {s.label}{" "}
              <span aria-hidden className="text-[10px]">
                ▾
              </span>
            </button>
            {isOpen && (
              <div
                role="menu"
                aria-label={`${s.label} pages`}
                className="absolute top-[calc(100%+12px)] left-0 z-40 flex w-[248px] flex-col gap-0.5 rounded-2xl border border-line bg-tile p-1.5 shadow-[var(--shadow-float)] before:absolute before:inset-x-0 before:-top-3.5 before:h-3.5 before:content-['']"
              >
                {s.pages.map((p) => (
                  <Link
                    key={p.to}
                    to={p.to}
                    role="menuitem"
                    activeProps={{}}
                    aria-current={on(path, p.to) ? "page" : undefined}
                    className="chip-host flex min-h-10 items-center gap-2.5 rounded-[10px] px-2 text-[14px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-raised"
                  >
                    <Chip g={p.g} tone={p.tone} size="md" />
                    <span className="flex-1">{p.label}</span>
                    {p.soon && <SoonPill />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

const PHONE_TAB =
  "press flex h-[62px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[18px] border-0 bg-transparent text-[11px] font-semibold no-underline";

/** The phone's floating bar: Overview, Money, +, Future, Manage. */
function PhoneBar({
  section,
  sheet,
  setSheet,
}: {
  section: number;
  sheet: string | null;
  setSheet: (s: string | null) => void;
}) {
  const sectionTab = (i: number) => {
    const s = SECTIONS[i];
    const expanded = sheet === s.id;
    const current = i === section;
    return (
      <button
        key={s.id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-current={current ? "true" : undefined}
        onClick={() => setSheet(expanded ? null : s.id)}
        className={cn(PHONE_TAB, expanded ? "text-teal" : current ? "text-ink" : "text-ink-3")}
      >
        <Chip g={s.g} size="md" tone={current ? "grad" : "neutral"} className={current ? "" : "!bg-transparent"} />
        {s.label}
      </button>
    );
  };
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),14px)] z-30 grid h-[70px] grid-cols-5 items-center rounded-[26px] border border-line-2 bg-tile/85 px-1 shadow-[var(--shadow-float)] backdrop-blur-xl backdrop-saturate-150 sm:hidden"
    >
      <Link
        to="/"
        activeProps={{}}
        aria-current={section === 0 ? "true" : undefined}
        className={cn(PHONE_TAB, section === 0 ? "text-ink" : "text-ink-3")}
      >
        <Chip
          g={I.overview}
          size="md"
          tone={section === 0 ? "grad" : "neutral"}
          className={section === 0 ? "" : "!bg-transparent"}
        />
        Overview
      </Link>
      {sectionTab(1)}
      <button
        type="button"
        aria-label="Record something"
        aria-haspopup="dialog"
        aria-expanded={sheet === "add"}
        onClick={() => setSheet(sheet === "add" ? null : "add")}
        className="press btn-primary mx-auto flex size-[58px] -translate-y-4 cursor-pointer items-center justify-center rounded-[20px] border-0"
      >
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden
          className={cn("transition-transform duration-200", sheet === "add" && "rotate-45")}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {sectionTab(2)}
      {sectionTab(3)}
    </nav>
  );
}

function ActionTile({
  g,
  tone,
  label,
  sub,
  onClick,
}: {
  g: Glyph;
  tone: Tone;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip-host press flex min-h-28 cursor-pointer flex-col gap-3.5 rounded-[20px] border border-line bg-tile-2 p-3.5 text-left text-ink"
    >
      <Chip g={g} tone={tone} size="lg" />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-[13px] text-ink-3">{sub}</span>
      </span>
    </button>
  );
}

/**
 * The section's pages, at the top of each page: pills with icon chips on a desktop, a strip of equal tabs on a phone
 * (so the page you're on is always in view).
 */
function SectionPages({ section, path }: { section: Section; path: string }) {
  const current = (p: Page) => on(path, p.to) || !!p.also?.some((a) => on(path, a));
  return (
    <nav aria-label={`${section.label} pages`}>
      <div className="hidden flex-wrap justify-end gap-2 sm:flex">
        {section.pages.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            activeProps={{}}
            aria-current={current(p) ? "page" : undefined}
            className="chip-host press inline-flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-tile py-1 pr-4 pl-2 text-[14px] font-semibold text-ink-2 no-underline hover:border-line-2 hover:text-ink aria-[current=page]:border-teal/50 aria-[current=page]:bg-teal/10 aria-[current=page]:text-ink"
          >
            <Chip g={p.g} tone={p.tone} size="md" />
            {p.label}
            {p.soon && <SoonPill />}
          </Link>
        ))}
      </div>
      <div
        className="grid gap-1 rounded-[18px] border border-line bg-tile p-1 sm:hidden"
        style={{ gridTemplateColumns: `repeat(${section.pages.length}, minmax(0, 1fr))` }}
      >
        {section.pages.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            activeProps={{}}
            aria-current={current(p) ? "page" : undefined}
            className="chip-host press flex h-14 flex-col items-center justify-center gap-1 rounded-[14px] text-[12px] font-semibold text-ink-3 no-underline aria-[current=page]:bg-teal/12 aria-[current=page]:text-ink"
          >
            <Chip g={p.g} tone={p.tone} size="sm" />
            {p.label === "Loan and offset" ? "Loan" : p.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
