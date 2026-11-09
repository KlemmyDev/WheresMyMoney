import { createFileRoute } from "@tanstack/react-router";
import { FireClose } from "~/features/fire/FireClose";

export const Route = createFileRoute("/_app/early-retirement_/close")({
  head: () => ({ meta: [{ title: "Close the gap · Early retirement · WheresMyMoney" }] }),
  component: FireClose,
});
