import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "~/features/spending/TransactionsPage";

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (s: Record<string, unknown>): { account?: number } => ({
    account: s.account != null && !Number.isNaN(Number(s.account)) ? Number(s.account) : undefined,
  }),
  head: () => ({ meta: [{ title: "Transactions · WheresMyMoney" }] }),
  component: Transactions,
});

function Transactions() {
  return <TransactionsPage account={Route.useSearch().account} />;
}
