import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function copyMapLibreWorkerAssets() {
  return {
    name: "copy-maplibre-worker-assets",
    closeBundle() {
      const sourceDir = resolve(projectRoot, "node_modules/maplibre-gl/dist");
      const assetDir = resolve(projectRoot, "dist/assets");
      mkdirSync(assetDir, { recursive: true });
      for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
        copyFileSync(resolve(sourceDir, file), resolve(assetDir, file));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyMapLibreWorkerAssets()],
  // MapLibre ships its map worker beside the main module. Pre-bundling rewrites
  // that relative URL into Vite's dependency cache, where the worker does not
  // exist, leaving a correctly sized but empty map during local development.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  // coffee-finder.com serves the app from the domain root. Keep this
  // configurable so a temporary preview can still choose another base path.
  base: process.env.VITE_BASE_PATH || "/",
  server: {
    host: true,
    port: 5190,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5190,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: ["es2020", "safari14", "chrome90"],
    cssTarget: ["safari14"],
  },
});
