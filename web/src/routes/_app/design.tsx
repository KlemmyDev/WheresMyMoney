import { createFileRoute } from "@tanstack/react-router";
import { DesignPage } from "~/features/design/DesignPage";

export const Route = createFileRoute("/_app/design")({
  head: () => ({ meta: [{ title: "Design system · WheresMyMoney" }] }),
  component: DesignPage,
});
