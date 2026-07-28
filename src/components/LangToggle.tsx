import { useStore } from "../store";
import { LANGS } from "../lib/i18n";

/** ES | EN pill in the header. Two languages, so a segmented toggle beats a dropdown. */
export function LangToggle() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);

  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          className={`lang-toggle__btn ${lang === l.id ? "is-on" : ""}`}
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
