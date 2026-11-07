import { createFileRoute } from "@tanstack/react-router";
import { NetWorthPage } from "~/features/networth/NetWorthPage";

export const Route = createFileRoute("/_app/net-worth")({
  head: () => ({ meta: [{ title: "Net worth · WheresMyMoney" }] }),
  component: NetWorthPage,
});
