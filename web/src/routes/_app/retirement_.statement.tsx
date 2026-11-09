import { createFileRoute } from "@tanstack/react-router";
import { StatementPage } from "~/features/retirement/StatementPage";

export const Route = createFileRoute("/_app/retirement_/statement")({
  head: () => ({ meta: [{ title: "Add a super statement · WheresMyMoney" }] }),
  // ?person=2 starts on that person's statement.
  validateSearch: (s: Record<string, unknown>): { person?: number } => (s.person ? { person: Number(s.person) } : {}),
  component: function Statement() {
    const { person } = Route.useSearch();
    return <StatementPage personId={person} />;
  },
});
