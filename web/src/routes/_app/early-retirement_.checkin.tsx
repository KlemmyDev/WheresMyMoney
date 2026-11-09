import { createFileRoute } from "@tanstack/react-router";
import { FireCheckin } from "~/features/fire/FireCheckin";

export const Route = createFileRoute("/_app/early-retirement_/checkin")({
  head: () => ({ meta: [{ title: "Check the plan · Early retirement · WheresMyMoney" }] }),
  component: FireCheckin,
});
