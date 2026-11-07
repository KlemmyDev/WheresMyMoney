import { createFileRoute } from "@tanstack/react-router";
import { SpendingPage } from "~/features/spending/SpendingPage";

export const Route = createFileRoute("/_app/spending")({
  head: () => ({ meta: [{ title: "Spending · WheresMyMoney" }] }),
  component: SpendingPage,
});
