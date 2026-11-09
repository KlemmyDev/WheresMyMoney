import { createFileRoute } from "@tanstack/react-router";
import { CryptoPage } from "~/features/investments/CryptoPage";

export const Route = createFileRoute("/_app/crypto")({
  head: () => ({ meta: [{ title: "Crypto · WheresMyMoney" }] }),
  component: CryptoPage,
});
