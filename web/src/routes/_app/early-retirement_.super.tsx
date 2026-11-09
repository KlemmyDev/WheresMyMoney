import { createFileRoute } from "@tanstack/react-router";
import { FireSuper } from "~/features/fire/FireSuper";

export const Route = createFileRoute("/_app/early-retirement_/super")({
  head: () => ({ meta: [{ title: "Super · Early retirement · WheresMyMoney" }] }),
  component: FireSuper,
});
