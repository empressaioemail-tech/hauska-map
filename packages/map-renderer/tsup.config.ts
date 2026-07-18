import { defineConfig } from "tsup";
import { copyFileSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // React and MapLibre are provided by the consuming app. pmtiles is a runtime
  // dependency resolved from node_modules (kept external so it isn't inlined).
  external: ["react", "react-dom", "react/jsx-runtime", "maplibre-gl", "pmtiles"],
  // Bundle the ported vanilla .js modules into the output.
  loader: { ".js": "jsx" },
  onSuccess: async () => {
    copyFileSync("src/styles.css", "dist/styles.css");
  },
});
