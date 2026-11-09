import { createFileRoute } from "@tanstack/react-router";
import { FireDrawdown } from "~/features/fire/FireDrawdown";

export const Route = createFileRoute("/_app/early-retirement_/drawdown")({
  head: () => ({ meta: [{ title: "Who pays for each year · Early retirement · WheresMyMoney" }] }),
  component: FireDrawdown,
});
