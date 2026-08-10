import { useMemo } from "react";
import { useStore } from "../store";
import { applyRoasterFilters, roasterShopUrl } from "../lib/roasters";
import { countryName } from "../lib/geography";
import { useT } from "../lib/useT";

/**
 * Searchable list of specialty roasters. Cards open the profile; the primary
 * business happens on the roaster's own site, never here.
 */
export function RoasterList() {
  const roasters = useStore((s) => s.roasters);
  const filters = useStore((s) => s.roasterFilters);
  const selectRoaster = useStore((s) => s.selectRoaster);
  const resetRoasterFilters = useStore((s) => s.resetRoasterFilters);
  const { t, lang } = useT();

  const visible = useMemo(
    () => applyRoasterFilters(roasters, filters),
    [roasters, filters],
  );

  if (visible.length === 0) {
    return (
      <div className="list list--empty">
        <p>{t("roasters.emptyTitle")}</p>
        <p className="list__hint">{t("roasters.emptyHint")}</p>
        <button className="btn" onClick={resetRoasterFilters}>
          {t("list.clearFilters")}
        </button>
      </div>
    );
  }

  return (
    <div className="list list--roasters">
      <p className="roasters__intro">{t("roasters.listIntro")}</p>

      {visible.map((roaster) => {
        const shop = roasterShopUrl(roaster);
        return (
          <button
            key={roaster.id}
            type="button"
            className="card card--roaster"
            onClick={() => selectRoaster(roaster.id)}
          >
            <div className="card__head">
              <span className="card__cat" aria-hidden="true">
                🔥
              </span>
              <div className="card__title">
                <h3>{roaster.name}</h3>
                <p className="card__comuna">
                  {[
                    roaster.city,
                    roaster.region,
                    countryName(roaster.countryCode, roaster.country, lang),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            {roaster.description && (
              <p className="card__items card__desc">{roaster.description}</p>
            )}

            <div className="card__badges">
              {roaster.shipsLocally && (
                <span className="badge badge--flag">{t("roasters.shipsLocally")}</span>
              )}
              {roaster.shipsInternationally && (
                <span className="badge badge--flag">{t("roasters.shipsInternationally")}</span>
              )}
              {roaster.hasSubscription && (
                <span className="badge badge--flag">{t("roasters.hasSubscription")}</span>
              )}
              {!shop && (
                <span className="badge badge--warn">{t("roasters.noShop")}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
