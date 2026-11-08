import { createFileRoute } from "@tanstack/react-router";
import { MerchantPage } from "~/features/merchants/MerchantPage";

export const Route = createFileRoute("/_app/merchants_/$key")({
  head: () => ({ meta: [{ title: "Merchant · WheresMyMoney" }] }),
  component: function Merchant() {
    const { key } = Route.useParams();
    return <MerchantPage key={key} merchantKey={key} />;
  },
});
