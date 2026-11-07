import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "~/features/bills/BillsPage";

export const Route = createFileRoute("/_app/bills")({
  head: () => ({ meta: [{ title: "Bills · WheresMyMoney" }] }),
  component: BillsPage,
});
