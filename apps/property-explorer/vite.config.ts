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
  define: {
    __HAUSKA_BUILD__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.HAUSKA_BUILD_SHA ||
        "UNSTAMPED",
    ),
  },
  resolve: {
    alias: {
      // The parcel fact-sheet contract resolves from SOURCE, so vitest and
      // `vite build` never depend on a prior package build (the same reason
      // liveGis.ts imports the map-renderer module by path). The package still
      // ships a dist for command-center, which consumes it the standard way.
      "@empressaio/parcel-fact-sheet": fileURLToPath(
        new URL("../../packages/parcel-fact-sheet/src/index.ts", import.meta.url),
      ),
      "@hauska/instrument-registry": fileURLToPath(
        new URL("../../packages/instrument-registry/src/index.ts", import.meta.url),
      ),
      // P-247: @hauska/map-renderer's package.json "exports" points only at
      // ./dist, with no dev/source condition (unlike the two aliases above,
      // which already exist for exactly this reason). Every existing
      // consumer here (ExplorerMap.tsx and 8 others) imports TYPES ONLY from
      // the package specifier, which Vite elides at transform time and never
      // resolves at runtime -- so this gap was latent until the first REAL
      // (non-type-only) import of the package reached vitest's module graph.
      // The specific styles.css subpath is aliased separately and FIRST:
      // the bare package alias below would otherwise prefix-match it too
      // (Vite/rollup-plugin-alias treats a string `find` as matching either
      // an exact specifier or `find + "/"+ rest`) and append "/styles.css"
      // onto index.ts, a file, not a directory.
      "@hauska/map-renderer/styles.css": fileURLToPath(
        new URL("../../packages/map-renderer/src/styles.css", import.meta.url),
      ),
      "@hauska/map-renderer": fileURLToPath(
        new URL("../../packages/map-renderer/src/index.ts", import.meta.url),
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
            "/api/pe-situs-search": {
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
