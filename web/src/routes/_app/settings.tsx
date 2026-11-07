import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "~/features/settings/SettingsPage";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · WheresMyMoney" }] }),
  // ?section=retirement opens that section.
  validateSearch: (s: Record<string, unknown>): { section?: string } =>
    typeof s.section === "string" ? { section: s.section } : {},
  component: SettingsPage,
});
