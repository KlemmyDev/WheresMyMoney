/** The early-retirement pages, as a row of chips under each page's title (the canvas's left nav). */
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/features/common/ui";

/** The pages, the on-track ones first, then the older tools. */
export const FIRE_PAGES = [
  { to: "/early-retirement", label: "On track?" },
  { to: "/early-retirement/checkpoints", label: "Checkpoints" },
  { to: "/early-retirement/super", label: "Super" },
  { to: "/early-retirement/bridge", label: "Outside super" },
  { to: "/early-retirement/debt", label: "Home loan" },
  { to: "/early-retirement/drawdown", label: "Who pays each year" },
  { to: "/early-retirement/setup", label: "Set the goal" },
  { to: "/early-retirement/assumptions", label: "Assumptions" },
  { to: "/early-retirement/scenarios", label: "Scenarios" },
  { to: "/early-retirement/next", label: "Where the extra goes" },
  { to: "/early-retirement/stress", label: "What could go wrong" },
] as const;

export function FireNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Early retirement" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
      {FIRE_PAGES.map((p) => {
        const on = path === p.to;
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 flex-none items-center rounded-full border px-4 text-[14px] font-semibold no-underline",
              on ? "border-bills bg-bills/15 text-ink" : "border-line-2 text-ink-2 hover:text-ink",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
