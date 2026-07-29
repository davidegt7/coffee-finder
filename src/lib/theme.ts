/**
 * Explicit light/dark, not just whatever the OS says.
 *
 * `prefers-color-scheme` alone is a guess about intent: plenty of people run a
 * dark OS and still want a bright map in daylight, and a café app gets opened in
 * both. The OS preference is the *initial* value; once someone chooses, that
 * choice wins and persists.
 *
 * The applied value lives on `<html data-theme>` so CSS can switch tokens with
 * no re-render, and so an inline script in index.html can set it before first
 * paint — otherwise a dark-mode user gets a white flash on every load.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "coffeefinder.theme";

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  // Keep the browser chrome (address bar, status bar) in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#faf7f3" : "#141110");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}
