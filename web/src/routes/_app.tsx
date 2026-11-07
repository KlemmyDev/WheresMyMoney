import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { sessionQuery } from "~/features/auth/LoginPage";
import { AppShell } from "~/features/common/layout";
import { setupQuery } from "~/features/common/queries";

/** Every signed-in page, in the Cockpit frame. A new household goes to the set-up guide first. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.authenticated) throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    const setup = await context.queryClient.ensureQueryData(setupQuery).catch(() => null);
    if (setup?.show) throw redirect({ to: "/setup", replace: true });
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = Route.useNavigate();
  // A request that comes back "sign in" (the session ended) goes to the sign-in page.
  useEffect(() => {
    const go = () => navigate({ to: "/login", search: { redirect: window.location.pathname } });
    window.addEventListener("wmm:unauthorized", go);
    return () => window.removeEventListener("wmm:unauthorized", go);
  }, [navigate]);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
