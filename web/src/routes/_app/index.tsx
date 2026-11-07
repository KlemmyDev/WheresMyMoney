import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "~/features/dashboard/DashboardPage";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Dashboard · WheresMyMoney" }] }),
  component: DashboardPage,
});
