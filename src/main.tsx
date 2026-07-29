import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { applyTheme, initialTheme } from "./lib/theme";

// Before render: the inline script in index.html already set data-theme to avoid
// a flash; this keeps the meta theme-color and storage in step.
applyTheme(initialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // A failed SW registration must never take the app down with it.
    });
  });
}
