import { createFileRoute } from "@tanstack/react-router";
import { FireDebt } from "~/features/fire/FireDebt";

export const Route = createFileRoute("/_app/early-retirement_/debt")({
  head: () => ({ meta: [{ title: "Loan or invest · Early retirement · WheresMyMoney" }] }),
  component: FireDebt,
});
