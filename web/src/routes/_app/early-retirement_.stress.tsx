import { createFileRoute } from "@tanstack/react-router";
import { FireStress } from "~/features/fire/FireStress";

export const Route = createFileRoute("/_app/early-retirement_/stress")({
  head: () => ({ meta: [{ title: "What could go wrong · Early retirement · WheresMyMoney" }] }),
  component: FireStress,
});
