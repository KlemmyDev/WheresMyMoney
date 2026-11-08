import { createFileRoute } from "@tanstack/react-router";
import { MerchantsPage } from "~/features/merchants/MerchantsPage";

export const Route = createFileRoute("/_app/merchants")({
  head: () => ({ meta: [{ title: "Merchants · WheresMyMoney" }] }),
  component: MerchantsPage,
});
