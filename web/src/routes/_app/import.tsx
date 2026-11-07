import { createFileRoute } from "@tanstack/react-router";
import { ImportPage } from "~/features/imports/ImportPage";

export const Route = createFileRoute("/_app/import")({
  head: () => ({ meta: [{ title: "Import a statement · WheresMyMoney" }] }),
  component: ImportPage,
});
