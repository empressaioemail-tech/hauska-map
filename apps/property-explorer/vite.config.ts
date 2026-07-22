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
          },
        }
      : {}),
  },
});
