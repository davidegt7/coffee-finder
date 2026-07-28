import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project site: https://davidegt7.github.io/coffee-finder/
  // Local / custom domain: leave unset or VITE_BASE_PATH=/
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
