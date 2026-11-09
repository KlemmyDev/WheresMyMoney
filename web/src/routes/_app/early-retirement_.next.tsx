import { createFileRoute } from "@tanstack/react-router";
import { FireNextDollar } from "~/features/fire/FireNextDollar";

export const Route = createFileRoute("/_app/early-retirement_/next")({
  head: () => ({ meta: [{ title: "Where the extra goes · Early retirement · WheresMyMoney" }] }),
  component: FireNextDollar,
});
