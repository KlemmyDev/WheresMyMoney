import { createFileRoute } from "@tanstack/react-router";
import { InvestmentsPage } from "~/features/investments/InvestmentsPage";

export const Route = createFileRoute("/_app/investments")({
  head: () => ({ meta: [{ title: "Investments · WheresMyMoney" }] }),
  component: InvestmentsPage,
});
