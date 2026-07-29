import { useStore } from "../store";
import { LANGS } from "../lib/i18n";

/**
 * Header controls: language and appearance.
 *
 * Both are segmented rather than dropdowns — two options each, so a menu would
 * cost a tap to show what a segment shows for free.
 */
export function LangToggle() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <div className="app__actions">
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        // The label names the destination, not the current state — "switch to
        // light" is actionable where "dark mode" is ambiguous.
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={theme === "dark" ? "Light" : "Dark"}
      >
        {theme === "dark" ? "\u2600\ufe0f" : "\ud83c\udf19"}
      </button>

      <div className="seg" role="group" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l.id}
            className={`seg__btn ${lang === l.id ? "is-on" : ""}`}
            onClick={() => setLang(l.id)}
            aria-pressed={lang === l.id}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
