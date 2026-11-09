import { createFileRoute } from "@tanstack/react-router";
import { FireAssumptions } from "~/features/fire/FireAssumptions";

export const Route = createFileRoute("/_app/early-retirement_/assumptions")({
  head: () => ({ meta: [{ title: "Assumptions · Early retirement · WheresMyMoney" }] }),
  component: FireAssumptions,
});
