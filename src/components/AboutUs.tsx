import { useT } from "../lib/useT";

export function AboutUs({ onClose }: { onClose: () => void }) {
  const { t } = useT();

  return (
    <div className="sheet sheet--editor sheet--about" role="dialog" aria-label={t("about.title")}>
      <button className="sheet__close" onClick={onClose} aria-label={t("common.close")}>
        ✕
      </button>
      <header className="sheet__head">
        <span className="sheet__cat">CoffeeFinder</span>
        <h2>{t("about.title")}</h2>
        <p className="sheet__addr">{t("about.intro")}</p>
      </header>
      <section className="sheet__section about__values">
        <div>
          <span aria-hidden="true">☕</span>
          <h3>{t("about.specialtyTitle")}</h3>
          <p>{t("about.specialtyBody")}</p>
        </div>
        <div>
          <span aria-hidden="true">✓</span>
          <h3>{t("about.reviewTitle")}</h3>
          <p>{t("about.reviewBody")}</p>
        </div>
        <div>
          <span aria-hidden="true">♡</span>
          <h3>{t("about.independentTitle")}</h3>
          <p>{t("about.independentBody")}</p>
        </div>
      </section>
      <div className="editor__actions">
        <button className="btn btn--primary" onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}
