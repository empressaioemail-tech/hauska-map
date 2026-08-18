import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local proxy harness (identical model to command-center): SPINE_PROXY_TARGET
// forwards /api/spine/* to a deployed Vercel project whose serverless proxy
// (api/spine.ts) holds the service keys — so local dev exercises the exact
// deployed anonymous data plane without any key on this machine.
//   SPINE_PROXY_TARGET=https://<deployed-explorer>.vercel.app pnpm --filter property-explorer dev
const spineProxyTarget = process.env.SPINE_PROXY_TARGET;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The parcel fact-sheet contract resolves from SOURCE, so vitest and
      // `vite build` never depend on a prior package build (the same reason
      // liveGis.ts imports the map-renderer module by path). The package still
      // ships a dist for command-center, which consumes it the standard way.
      "@hauska/parcel-fact-sheet": fileURLToPath(
        new URL("../../packages/parcel-fact-sheet/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5175,
    ...(spineProxyTarget
      ? {
          proxy: {
            "/api/spine": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-gtm": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-billing": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-terrain-export": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-site-plan-export": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-geocode": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-share": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/pe-share-view": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/auth": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
            "/api/spine-deep": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
});
