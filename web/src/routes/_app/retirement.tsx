import { createFileRoute } from "@tanstack/react-router";
import { RetirementPage } from "~/features/retirement/RetirementPage";

export const Route = createFileRoute("/_app/retirement")({
  head: () => ({ meta: [{ title: "Retirement · WheresMyMoney" }] }),
  component: RetirementPage,
});
