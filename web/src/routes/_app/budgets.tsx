import { createFileRoute } from "@tanstack/react-router";
import { BudgetsPage } from "~/features/spending/BudgetsPage";

export const Route = createFileRoute("/_app/budgets")({
  head: () => ({ meta: [{ title: "Budgets · WheresMyMoney" }] }),
  component: BudgetsPage,
});
