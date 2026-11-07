import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQuery } from "~/features/auth/LoginPage";
import { SetupPage } from "~/features/setup/SetupPage";

export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) throw redirect({ to: "/login", replace: true });
  },
  head: () => ({ meta: [{ title: "Set up · WheresMyMoney" }] }),
  component: SetupPage,
});
