/** The pages planned for later phases (docs/plan.md), saying what's coming rather than showing nothing. */
import { Link } from "@tanstack/react-router";
import { PageHead, Tile } from "~/features/common/ui";

const PAGES = {
  "net-worth": {
    title: "Net worth",
    phase: "Phase 2",
    body: "Your net worth over time, from each check-in, statement import and price, with a home value you set and a car that depreciates; and a monthly review of what came in, went out and moved.",
  },
  investments: {
    title: "Investments",
    phase: "Phase 3",
    body: "Holdings by platform (brokers, micro-investing, crypto exchanges and wallets, super funds), with units, cost base and dates kept for CGT, and prices from public market data. Only tickers leave your server.",
  },
  retirement: {
    title: "Retirement",
    phase: "Phase 4",
    body: "A two-pot plan: a bridge pot outside super from when you'd like to stop work until 60, then super from 60, on your own assumptions. General information, never advice, and no products recommended.",
  },
} as const;

export function SoonPage({ page }: { page: keyof typeof PAGES }) {
  const p = PAGES[page];
  return (
    <>
      <PageHead over={`COMING IN ${p.phase.toUpperCase()}`} title={p.title} />
      <Tile i={0} className="max-w-[720px]">
        <div className="text-ink-2">{p.body}</div>
        <div className="text-[13px] text-ink-3">
          This version covers your accounts, the loan, check-ins, statement imports, bills and spending. Until then, the{" "}
          <Link to="/" className="text-teal">
            dashboard
          </Link>{" "}
          has the loan and every account.
        </div>
      </Tile>
    </>
  );
}
