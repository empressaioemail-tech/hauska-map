import { defineConfig } from "tsup";
import { copyFileSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // React and MapLibre are provided by the consuming app.
  external: ["react", "react-dom", "react/jsx-runtime", "maplibre-gl"],
  // Bundle the ported vanilla .js modules into the output.
  loader: { ".js": "jsx" },
  onSuccess: async () => {
    copyFileSync("src/styles.css", "dist/styles.css");
  },
});
