import { createFileRoute } from "@tanstack/react-router";
import { AccountsPage } from "~/features/accounts/AccountsPage";

export const Route = createFileRoute("/_app/accounts")({
  validateSearch: (s: Record<string, unknown>): { id?: number } => ({
    id: s.id != null && !Number.isNaN(Number(s.id)) ? Number(s.id) : undefined,
  }),
  head: () => ({ meta: [{ title: "Accounts · WheresMyMoney" }] }),
  component: Accounts,
});

function Accounts() {
  return <AccountsPage selected={Route.useSearch().id} />;
}
