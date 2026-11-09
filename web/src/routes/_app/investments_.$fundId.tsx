import { createFileRoute } from "@tanstack/react-router";
import { HoldingPage } from "~/features/investments/HoldingPage";

export const Route = createFileRoute("/_app/investments_/$fundId")({
  head: () => ({ meta: [{ title: "Holding · WheresMyMoney" }] }),
  component: function Holding() {
    const { fundId } = Route.useParams();
    return <HoldingPage id={Number(fundId)} />;
  },
});
