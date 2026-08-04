import { watchForUpdate } from "./lib/appUpdate";
import { useStore } from "./store";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
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

window.addEventListener("load", () => {
  watchForUpdate(() => useStore.getState().setUpdateReady(true));
});
