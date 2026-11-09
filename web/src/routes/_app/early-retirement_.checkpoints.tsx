import { createFileRoute } from "@tanstack/react-router";
import { FireCheckpoints } from "~/features/fire/FireCheckpoints";

export const Route = createFileRoute("/_app/early-retirement_/checkpoints")({
  head: () => ({ meta: [{ title: "Checkpoints · Early retirement · WheresMyMoney" }] }),
  component: FireCheckpoints,
});
