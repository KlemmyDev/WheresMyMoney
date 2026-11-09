import { createFileRoute } from "@tanstack/react-router";
import { FireSetup } from "~/features/fire/FireSetup";

export const Route = createFileRoute("/_app/early-retirement_/setup")({
  head: () => ({ meta: [{ title: "Set your goal · Early retirement · WheresMyMoney" }] }),
  component: FireSetup,
});
