import { createFileRoute } from "@tanstack/react-router";
import { FireHub } from "~/features/fire/FireHub";

export const Route = createFileRoute("/_app/early-retirement")({
  head: () => ({ meta: [{ title: "Early retirement · WheresMyMoney" }] }),
  component: FireHub,
});
