import { createFileRoute } from "@tanstack/react-router";
import { SortPage } from "~/features/spending/SortPage";

export const Route = createFileRoute("/_app/sort")({
  head: () => ({ meta: [{ title: "Sort by merchant · WheresMyMoney" }] }),
  component: SortPage,
});
