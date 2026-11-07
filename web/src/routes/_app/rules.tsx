import { createFileRoute } from "@tanstack/react-router";
import { RulesPage } from "~/features/rules/RulesPage";

export const Route = createFileRoute("/_app/rules")({
  head: () => ({ meta: [{ title: "Rules · WheresMyMoney" }] }),
  component: RulesPage,
});
