import { createFileRoute, redirect } from "@tanstack/react-router";
import { AccountsPage } from "~/features/accounts/AccountsPage";

export const Route = createFileRoute("/_app/accounts")({
  // Older links chose an account with ?id=; each account has its own page now.
  validateSearch: (s: Record<string, unknown>): { id?: number } => ({
    id: s.id != null && !Number.isNaN(Number(s.id)) ? Number(s.id) : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.id != null)
      throw redirect({ to: "/accounts/$accountId", params: { accountId: String(search.id) }, replace: true });
  },
  head: () => ({ meta: [{ title: "Accounts · WheresMyMoney" }] }),
  component: AccountsPage,
});
