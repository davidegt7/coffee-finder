import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, EMPTY_FILTERS } from "../lib/filters";
import { beanSellers, recordBeanClick } from "../lib/beans";
import { countryName } from "../lib/geography";
import { useT } from "../lib/useT";
import { CATEGORY_LABELS } from "../types";

/**
 * "Dónde comprar grano" — roasters who sell beans, and a link to where.
 *
 * Scoped by the LOCATION filters only (country / city / barrio), not by the
 * claim and amenity filters. Someone who narrowed the map to "sin gluten"
 * cafés with wifi is describing where they want to sit, not whose beans they
 * want in the post, and silently applying those here would produce an empty
 * list with no visible cause. Where you are still matters, so that part stays.
 *
 * Order is alphabetical and nothing else — see beanSellers() for why that
 * isn't an implementation detail.
 */
export function BeansSheet() {
  const places = useStore((s) => s.places);
  const filters = useStore((s) => s.filters);
  const setBeansOpen = useStore((s) => s.setBeansOpen);
  const { t, lang } = useT();

  const sellers = useMemo(
    () =>
      beanSellers(
        // Built up from EMPTY_FILTERS rather than stripped down from the live
        // ones, so a filter added later is excluded by default instead of
        // silently narrowing this list the day someone introduces it.
        applyFilters(places, {
          ...EMPTY_FILTERS,
          countryCode: filters.countryCode,
          city: filters.city,
          comunas: filters.comunas,
        }),
      ),
    [places, filters.countryCode, filters.city, filters.comunas],
  );

  const where =
    filters.city ??
    (filters.countryCode
      ? countryName(
          filters.countryCode,
          places.find((p) => p.countryCode === filters.countryCode)?.country ?? "",
          lang,
        )
      : null);

  return (
    <div className="sheet sheet--beans" role="dialog" aria-label={t("beans.title")}>
      <button
        className="sheet__close"
        onClick={() => setBeansOpen(false)}
        aria-label={t("common.close")}
      >
        ✕
      </button>

      <header className="sheet__head">
        <span className="sheet__cat">🫘 {t("beans.eyebrow")}</span>
        <h2>{t("beans.title")}</h2>
      </header>

      <p className="field__hint">{t("beans.intro")}</p>

      {sellers.length === 0 ? (
        <p className="beans__empty">
          {where ? t("beans.emptyHere", { where }) : t("beans.empty")}
        </p>
      ) : (
        <>
          <p className="beans__count">{t("beans.count", { n: sellers.length })}</p>
          <ul className="beans__list">
            {sellers.map(({ place, url, viaInstagram }) => (
              <li key={place.id} className="beans__row">
                <div className="beans__body">
                  <strong className="beans__name">{place.name}</strong>
                  <span className="beans__meta">
                    {CATEGORY_LABELS[place.category].icon}{" "}
                    {CATEGORY_LABELS[place.category][lang]}
                    {place.comuna && ` · ${place.comuna}`}
                    {place.city && ` · ${place.city}`}
                  </span>
                  {/* Said plainly rather than implied: an Instagram profile is
                      not a shop, and someone expecting a checkout deserves to
                      know before they tap. */}
                  {viaInstagram && <span className="beans__via">{t("beans.viaInstagram")}</span>}
                </div>
                <a
                  className="btn btn--primary beans__buy"
                  href={url}
                  target="_blank"
                  // noreferrer as well as noopener: the destination has no
                  // business knowing which page sent someone, and we already
                  // count the click on our own side.
                  rel="noopener noreferrer"
                  onClick={() => recordBeanClick(place.id)}
                >
                  {t("beans.buy")}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="field__hint beans__note">{t("beans.note")}</p>
    </div>
  );
}
