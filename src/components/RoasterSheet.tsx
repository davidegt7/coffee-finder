import { useState } from "react";
import { useStore } from "../store";
import { roasterBrandUrl, roasterShopUrl } from "../lib/roasters";
import { directionsUrl, instagramUrl } from "../lib/links";
import { roasterUrl } from "../lib/roasterUrl";
import { recordRoasterReferral, trackedRoasterUrl } from "../lib/referrals";
import { countryName } from "../lib/geography";
import { useT } from "../lib/useT";
import { useSwipeToDismiss } from "../lib/useSwipeToDismiss";

/**
 * Profile for one specialty roaster.
 *
 * The product promise is discovery + handoff: learn who they are, where
 * they're based, how they ship, then leave for their own store. We never take
 * money or place an order.
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

  const shop = roasterShopUrl(roaster);
  const brand = roasterBrandUrl(roaster);
  const trackedShop = shop ? trackedRoasterUrl(shop, roaster.id, "shop") : undefined;
  const trackedBrand = brand ? trackedRoasterUrl(brand, roaster.id, "website") : undefined;
  const buyLabel = shop
    ? roaster.onlineStore
      ? t("roasters.buy")
      : t("roasters.visit")
    : null;

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
            roaster.address,
            roaster.city,
            roaster.region,
            countryName(roaster.countryCode, roaster.country, lang),
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        <div className="sheet__links">
          <a
            href={directionsUrl(roaster.lat, roaster.lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("sheet.directions")}
          </a>
          <button type="button" className="link-like" onClick={() => void share()}>
            {shared ? t("sheet.shareDone") : t("sheet.share")}
          </button>
          {brand && (
            <a
              href={trackedBrand}
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

      {shop && buyLabel && (
        <div className="roaster__cta">
          <a
            className="btn btn--primary roaster__buy"
            href={trackedShop}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void recordRoasterReferral(roaster.id, "shop")}
          >
            {buyLabel} ↗
          </a>
          <p className="field__hint roaster__cta-note">{t("roasters.ctaNote")}</p>
        </div>
      )}

      {roaster.description && (
        <section className="sheet__section">
          <h3>{t("roasters.about")}</h3>
          <p className="roaster__desc">{roaster.description}</p>
        </section>
      )}

      <section className="sheet__section">
        <h3>{t("roasters.shipping")}</h3>
        <div className="card__badges">
          {roaster.shipsLocally ? (
            <span className="badge badge--flag is-yes">{t("roasters.shipsLocally")}</span>
          ) : (
            <span className="badge badge--flag is-no">{t("roasters.noLocalShip")}</span>
          )}
          {roaster.shipsInternationally ? (
            <span className="badge badge--flag is-yes">{t("roasters.shipsInternationally")}</span>
          ) : (
            <span className="badge badge--flag is-no">{t("roasters.noIntlShip")}</span>
          )}
          {roaster.hasSubscription ? (
            <span className="badge badge--flag is-yes">{t("roasters.hasSubscription")}</span>
          ) : (
            <span className="badge badge--flag is-no">{t("roasters.noSubscription")}</span>
          )}
        </div>
        {roaster.shippingNotes && (
          <p className="field__hint roaster__ship-note">{roaster.shippingNotes}</p>
        )}
      </section>

      {roaster.physicalLocations && roaster.physicalLocations.length > 0 && (
        <section className="sheet__section">
          <h3>
            {t("roasters.locations")}{" "}
            <span className="count">{roaster.physicalLocations.length}</span>
          </h3>
          <ul className="roaster__locations">
            {roaster.physicalLocations.map((loc, i) => (
              <li key={`${loc.city}-${loc.name ?? i}`}>
                <strong>{loc.name ?? loc.city}</strong>
                <span>
                  {[
                    loc.address,
                    loc.name ? loc.city : null,
                    countryName(loc.countryCode, loc.country, lang),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roaster.sources.length > 0 && (
        <section className="sheet__section">
          <h3>{t("sheet.sources")}</h3>
          <ul className="roaster__sources">
            {roaster.sources.map((src) => (
              <li key={src}>
                {/^https?:\/\//i.test(src) ? (
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    {src.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  src
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="field__hint roaster__foot">{t("roasters.foot")}</p>
    </div>
  );
}
