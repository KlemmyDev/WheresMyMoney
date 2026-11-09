import { createFileRoute } from "@tanstack/react-router";
import { FireBridge } from "~/features/fire/FireBridge";

export const Route = createFileRoute("/_app/early-retirement_/bridge")({
  head: () => ({ meta: [{ title: "Outside super · Early retirement · WheresMyMoney" }] }),
  component: FireBridge,
});
