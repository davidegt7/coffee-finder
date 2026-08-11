import { useState } from "react";
import { useStore } from "../store";
import { roasterWebsiteUrl } from "../lib/roasters";
import { instagramUrl } from "../lib/links";
import { roasterUrl } from "../lib/roasterUrl";
import { recordRoasterReferral, trackedRoasterUrl } from "../lib/referrals";
import { countryName } from "../lib/geography";
import { useT } from "../lib/useT";
import { useSwipeToDismiss } from "../lib/useSwipeToDismiss";

/**
 * Profile for one specialty roaster.
 *
 * The product promise is discovery + handoff: learn who they are and visit
 * their website or Instagram. Sales and fulfillment stay with the roaster.
 */
export function RoasterSheet() {
  const selectedRoasterId = useStore((s) => s.selectedRoasterId);
  const roasters = useStore((s) => s.roasters);
  const selectRoaster = useStore((s) => s.selectRoaster);
  const { t, lang } = useT();
  const [shared, setShared] = useState(false);
  const swipe = useSwipeToDismiss(() => selectRoaster(null));

  const roaster = roasters.find((r) => r.id === selectedRoasterId);
  if (!roaster) return null;

  const website = roasterWebsiteUrl(roaster);
  const trackedWebsite = website
    ? trackedRoasterUrl(website, roaster.id, "website")
    : undefined;

  const share = async () => {
    const url = roasterUrl(roaster.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: roaster.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2_000);
    } catch {
      /* cancelled or unsupported */
    }
  };

  return (
    <div
      className={`sheet sheet--roaster ${swipe.dragging ? "is-dragging" : ""}`}
      role="dialog"
      aria-label={roaster.name}
      ref={swipe.ref}
      style={swipe.style}
    >
      <div className="sheet__drag" {...swipe.handlers}>
        <span className="sheet__grip" aria-hidden="true" />
      </div>
      <button
        className="sheet__close"
        onClick={() => selectRoaster(null)}
        aria-label={t("common.close")}
      >
        ✕
      </button>

      {roaster.photoUrl && (
        <figure className="sheet__photo" {...swipe.handlers}>
          <img
            src={roaster.photoUrl}
            alt={roaster.name}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.closest("figure") as HTMLElement).style.display = "none";
            }}
          />
          {roaster.photoCredit && <figcaption>{roaster.photoCredit}</figcaption>}
        </figure>
      )}

      <header className="sheet__head" {...swipe.handlers}>
        <span className="sheet__cat">🔥 {t("roasters.eyebrow")}</span>
        <div className="sheet__title-row">
          <h2>{roaster.name}</h2>
        </div>
        <p className="sheet__addr">
          {[
            roaster.city,
            roaster.region,
            countryName(roaster.countryCode, roaster.country, lang),
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        <div className="sheet__links">
          <button type="button" className="link-like" onClick={() => void share()}>
            {shared ? t("sheet.shareDone") : t("sheet.share")}
          </button>
          {website && (
            <a
              href={trackedWebsite}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void recordRoasterReferral(roaster.id, "website")}
            >
              {t("sheet.website")}
            </a>
          )}
          {roaster.instagram && (
            <a
              className="link--ig"
              href={instagramUrl(roaster.instagram)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("sheet.instagram")}
            </a>
          )}
        </div>
      </header>

      {roaster.description && (
        <section className="sheet__section">
          <h3>{t("roasters.about")}</h3>
          <p className="roaster__desc">{roaster.description}</p>
        </section>
      )}

      <p className="field__hint roaster__foot">{t("roasters.foot")}</p>
    </div>
  );
}
