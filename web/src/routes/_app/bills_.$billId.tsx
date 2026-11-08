import { createFileRoute } from "@tanstack/react-router";
import { BillPage } from "~/features/bills/BillPage";

export const Route = createFileRoute("/_app/bills_/$billId")({
  head: () => ({ meta: [{ title: "Bill · WheresMyMoney" }] }),
  component: function Bill() {
    const { billId } = Route.useParams();
    return <BillPage id={Number(billId)} />;
  },
});
