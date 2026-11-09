import { createFileRoute } from "@tanstack/react-router";
import { SpottedPage } from "~/features/bills/SpottedPage";

export const Route = createFileRoute("/_app/bills_/spotted")({
  head: () => ({ meta: [{ title: "We spotted some bills · WheresMyMoney" }] }),
  component: SpottedPage,
});
