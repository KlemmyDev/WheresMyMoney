import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * The app is a single-page app: `vite build` writes static files that FastAPI serves.
 *
 * In development, /api is proxied to a running backend, set with API_TARGET in web/.env.local:
 * a local (or DEMO=1) backend, or your home server, e.g. API_TARGET=http://192.168.0.215:8080.
 * Requests that would change things on a server that isn't this machine (a check-in, an import)
 * are refused unless API_ALLOW_WRITES=1, so trying the UI can't alter the household's money by accident.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_TARGET || "http://127.0.0.1:8080";
  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(target);
  const allowWrites = env.API_ALLOW_WRITES ? env.API_ALLOW_WRITES === "1" : local;
  return {
    server: {
      port: Number(env.PORT) || 5174,
      // Fail if the port is taken rather than quietly moving to another, so the URL stays put.
      strictPort: true,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          // The backend refuses changes whose Origin isn't its own address (cross-site requests), and through this
          // proxy the page's origin is the dev server's: pass the backend's own instead.
          configure: (proxy) =>
            proxy.on("proxyReq", (req) => {
              if (req.getHeader("origin")) req.setHeader("origin", new URL(target).origin);
            }),
        },
        "/healthz": { target, changeOrigin: true },
      },
    },
    // `vite build` renders the app shell by starting a preview server and fetching "/" from it.
    // Pin it to IPv4 loopback: in Linux containers "localhost" can bind to ::1 while the build
    // connects to 127.0.0.1, which fails the Docker build with ECONNREFUSED.
    preview: { host: "127.0.0.1" },
    resolve: { tsconfigPaths: true },
    plugins: [
      ...(allowWrites ? [] : [readOnlyApi(target)]),
      tailwindcss(),
      tanstackStart({ spa: { enabled: true } }),
      viteReact(),
    ],
  };
});

/** Refuse API writes (except signing in and out) before they reach the proxy. */
function readOnlyApi(target: string): Plugin {
  return {
    name: "wmp-read-only-api",
    configureServer(server) {
      server.config.logger.info(`  API from ${target} (read-only; set API_ALLOW_WRITES=1 to allow saving)`);
      server.middlewares.use((req, res, next) => {
        const write = req.method && !["GET", "HEAD", "OPTIONS"].includes(req.method);
        if (!write || !req.url?.startsWith("/api/") || req.url.startsWith("/api/auth/")) return next();
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ detail: "Saving is turned off in development (set API_ALLOW_WRITES=1 to allow it)." }),
        );
      });
    },
  };
}
