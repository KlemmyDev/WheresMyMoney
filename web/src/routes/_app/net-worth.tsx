import { createFileRoute } from "@tanstack/react-router";
import { SoonPage } from "~/features/soon/SoonPage";

export const Route = createFileRoute("/_app/net-worth")({
  component: () => <SoonPage page="net-worth" />,
});
