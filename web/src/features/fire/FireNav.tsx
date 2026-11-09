/** The early-retirement pages, as a row of chips under each page's title (the canvas's left nav). */
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "~/features/common/ui";

/** The pages built so far, in the canvas's order. */
export const FIRE_PAGES = [
  { to: "/early-retirement", label: "Freedom" },
  { to: "/early-retirement/scenarios", label: "Scenarios" },
  { to: "/early-retirement/bridge", label: "Before super opens" },
  { to: "/early-retirement/next", label: "Where the extra goes" },
  { to: "/early-retirement/debt", label: "Loan or invest" },
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
