import { createFileRoute } from "@tanstack/react-router";
import { LoanPage } from "~/features/accounts/LoanPage";

export const Route = createFileRoute("/_app/loan")({
  head: () => ({ meta: [{ title: "Home loan · WheresMyMoney" }] }),
  // ?rate=1 opens "The rate changed".
  validateSearch: (s: Record<string, unknown>): { rate?: number } => (s.rate ? { rate: 1 } : {}),
  component: LoanPage,
});
