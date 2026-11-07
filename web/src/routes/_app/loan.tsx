import { createFileRoute } from "@tanstack/react-router";
import { LoanPage } from "~/features/accounts/LoanPage";

export const Route = createFileRoute("/_app/loan")({
  head: () => ({ meta: [{ title: "Loan · WheresMyMoney" }] }),
  component: LoanPage,
});
