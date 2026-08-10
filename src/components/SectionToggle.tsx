import { useStore } from "../store";
import { useT } from "../lib/useT";

/**
 * Cafés ↔ Roasters. Same shell, two errands.
 *
 * Lives in the brand row so the visitor always knows which directory they're
 * in — a buried menu would make "why did the filters change?" a support ticket.
 */
export function SectionToggle() {
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const { t } = useT();

  return (
    <div className="section-toggle" role="tablist" aria-label={t("section.label")}>
      <button
        type="button"
        role="tab"
        aria-selected={section === "cafes"}
        className={`section-toggle__btn ${section === "cafes" ? "is-on" : ""}`}
        onClick={() => setSection("cafes")}
      >
        ☕ {t("section.cafes")}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={section === "roasters"}
        className={`section-toggle__btn ${section === "roasters" ? "is-on" : ""}`}
        onClick={() => setSection("roasters")}
      >
        🔥 {t("section.roasters")}
      </button>
    </div>
  );
}
