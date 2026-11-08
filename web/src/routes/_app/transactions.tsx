import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage, type TxSearch } from "~/features/spending/TransactionsPage";

const num = (v: unknown) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);

export const Route = createFileRoute("/_app/transactions")({
  // ?account=2 for one account, ?month=2026-10 for another month, ?category=7 (or "unsorted") for one category.
  validateSearch: (s: Record<string, unknown>): TxSearch => ({
    account: num(s.account),
    month: typeof s.month === "string" && /^\d{4}-\d{2}$/.test(s.month) ? s.month : undefined,
    category: s.category === "unsorted" ? "unsorted" : num(s.category),
  }),
  head: () => ({ meta: [{ title: "Transactions · WheresMyMoney" }] }),
  component: Transactions,
});

function Transactions() {
  return <TransactionsPage search={Route.useSearch()} />;
}
