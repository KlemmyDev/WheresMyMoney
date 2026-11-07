import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "~/styles/app.css?url";
import { ToastProvider } from "~/features/common/overlay";
import type { RouterContext } from "~/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "WheresMyMoney" },
      { name: "theme-color", content: "#0d1117" },
      { name: "color-scheme", content: "dark" },
      { name: "apple-mobile-web-app-title", content: "Money" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      // The fonts come with it (@fontsource, in app.css), not from Google Fonts.
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  component: Root,
});

function Root() {
  const { queryClient } = Route.useRouteContext();
  useNoPinchZoom();
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * No pinch-to-zoom: it should feel like an app on a phone. The viewport meta asks browsers not to zoom, but Safari on
 * iPhone ignores that for pinches, so its gesture events are turned down too. (Double-tap zoom is off through
 * touch-action in app.css.)
 */
function useNoPinchZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
}
