import { createFileRoute } from "@tanstack/react-router";
import { SuperPage } from "~/features/retirement/SuperPage";

export const Route = createFileRoute("/_app/retirement_/super/$personId")({
  head: () => ({ meta: [{ title: "Super · WheresMyMoney" }] }),
  component: function Super() {
    const { personId } = Route.useParams();
    return <SuperPage id={Number(personId)} />;
  },
});
