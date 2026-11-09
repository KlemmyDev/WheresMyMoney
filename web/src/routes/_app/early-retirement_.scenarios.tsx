import { createFileRoute } from "@tanstack/react-router";
import { FireScenarios } from "~/features/fire/FireScenarios";

export const Route = createFileRoute("/_app/early-retirement_/scenarios")({
  head: () => ({ meta: [{ title: "Scenarios · Early retirement · WheresMyMoney" }] }),
  component: FireScenarios,
});
