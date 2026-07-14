import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local proxy harness: SPINE_PROXY_TARGET forwards /api/spine/* to a deployed
// console (e.g. https://cmdcenter-blush.vercel.app), whose serverless proxy
// holds the service keys — so local dev exercises the exact deployed data
// plane without any key on this machine.
//   SPINE_PROXY_TARGET=https://cmdcenter-blush.vercel.app pnpm dev:cc
const spineProxyTarget = process.env.SPINE_PROXY_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    ...(spineProxyTarget
      ? {
          proxy: {
            "/api/spine": {
              target: spineProxyTarget,
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
});
