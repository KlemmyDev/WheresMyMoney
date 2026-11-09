import { createFileRoute } from "@tanstack/react-router";
import { AssetPage } from "~/features/networth/AssetPage";

export const Route = createFileRoute("/_app/net-worth_/$assetId")({
  head: () => ({ meta: [{ title: "Something you own · WheresMyMoney" }] }),
  component: Asset,
});

function Asset() {
  return <AssetPage assetId={Number(Route.useParams().assetId)} />;
}
