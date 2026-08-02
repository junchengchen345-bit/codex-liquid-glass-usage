import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readCodexUsage } from "./server/codexUsage.mjs";

function codexUsageApi() {
  const middleware = (request, response, next) => {
    if (request.method !== "GET" || request.url?.split("?")[0] !== "/api/codex-usage") {
      next();
      return;
    }

    readCodexUsage()
      .then((payload) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store, max-age=0");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(payload));
      })
      .catch((error) => {
        response.statusCode = 503;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store, max-age=0");
        response.end(JSON.stringify({ error: "暂时无法读取 Codex 账户数据。", detail: error.message }));
      });
  };

  return {
    name: "codex-usage-local-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  // The project has no runtime public assets. Keeping this disabled prevents
  // local design-review screenshots from being copied into release bundles.
  publicDir: false,
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1", "terminal.local"],
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  preview: {
    host: "127.0.0.1",
  },
  plugins: [react(), codexUsageApi()],
});
