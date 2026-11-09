import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "~/features/accounts/AccountPage";

export const Route = createFileRoute("/_app/accounts_/$accountId")({
  head: () => ({ meta: [{ title: "Account · WheresMyMoney" }] }),
  component: Account,
});

function Account() {
  return <AccountPage accountId={Number(Route.useParams().accountId)} />;
}
