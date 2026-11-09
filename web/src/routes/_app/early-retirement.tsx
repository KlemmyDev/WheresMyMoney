import { createFileRoute } from "@tanstack/react-router";
import { FireTrack } from "~/features/fire/FireTrack";

export const Route = createFileRoute("/_app/early-retirement")({
  head: () => ({ meta: [{ title: "Are we on track? · Early retirement · WheresMyMoney" }] }),
  component: FireTrack,
});
