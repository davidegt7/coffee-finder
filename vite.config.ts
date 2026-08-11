import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Make the service worker byte-for-byte different whenever Vite produces a new
 * entry page. Browsers only check the worker file itself for updates; hashed
 * app assets changing underneath an identical sw.js are invisible to an
 * already-open phone app.
 */
function stampServiceWorkerBuild() {
  return {
    name: "stamp-service-worker-build",
    closeBundle() {
      const indexPath = resolve(projectRoot, "dist/index.html");
      const workerPath = resolve(projectRoot, "dist/sw.js");
      const index = readFileSync(indexPath, "utf8");
      const fingerprint = createHash("sha256").update(index).digest("hex").slice(0, 12);
      const worker = readFileSync(workerPath, "utf8");
      const token = "__COFFEE_FINDER_BUILD__";
      if (!worker.includes(token)) throw new Error("Service worker build token is missing");
      writeFileSync(workerPath, worker.replaceAll(token, `build-${fingerprint}`));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyMapLibreWorkerAssets(), stampServiceWorkerBuild()],
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
