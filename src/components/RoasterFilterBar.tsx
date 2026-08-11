import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import {
  activeRoasterFilterCount,
  roasterCityCounts,
  roasterCountryCounts,
  roasterRegionCounts,
} from "../lib/roasters";
import { CONTINENT_LABELS, continentOf, countryName, type ContinentId } from "../lib/geography";
import { useT } from "../lib/useT";

type Menu = "where" | "ship" | null;

/**
 * Filters for the roasters directory: where they are + how they ship.
 *
 * Deliberately thinner than the café FilterBar. Claims, wifi, and brunch are
 * café questions; here the useful axes are geography and "can I actually get
 * beans from them".
 */
export function RoasterFilterBar() {
  const roasters = useStore((s) => s.roasters);
  const filters = useStore((s) => s.roasterFilters);
  const setRoasterCountry = useStore((s) => s.setRoasterCountry);
  const setRoasterCity = useStore((s) => s.setRoasterCity);
  const setRoasterRegion = useStore((s) => s.setRoasterRegion);
  const setRoasterQuery = useStore((s) => s.setRoasterQuery);
  const toggleRoasterShipLocal = useStore((s) => s.toggleRoasterShipLocal);
  const toggleRoasterShipIntl = useStore((s) => s.toggleRoasterShipIntl);
  const setRoasterBuying = useStore((s) => s.setRoasterBuying);
  const resetRoasterFilters = useStore((s) => s.resetRoasterFilters);
  const { t, lang } = useT();

  const [menu, setMenu] = useState<Menu>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const countries = useMemo(() => roasterCountryCounts(roasters), [roasters]);
  const cities = useMemo(
    () => roasterCityCounts(roasters, filters.countryCode),
    [roasters, filters.countryCode],
  );
  const regions = useMemo(
    () => roasterRegionCounts(roasters, filters.countryCode),
    [roasters, filters.countryCode],
  );

  const byContinent = useMemo(() => {
    const groups = new Map<ContinentId, typeof countries>();
    for (const c of countries) {
      const cont = continentOf(c.code);
      const list = groups.get(cont) ?? [];
      list.push(c);
      groups.set(cont, list);
    }
    const order: ContinentId[] = ["americas", "europe", "asia", "oceania", "africa", "other"];
    return order
      .filter((id) => groups.has(id))
      .map((id) => ({ id, label: CONTINENT_LABELS[id][lang], countries: groups.get(id)! }));
  }, [countries, lang]);

  const active = activeRoasterFilterCount(filters);
  const whereLabel = filters.city
    ? filters.city
    : filters.region
      ? filters.region
      : filters.countryCode
        ? countryName(
            filters.countryCode,
            countries.find((c) => c.code === filters.countryCode)?.country ?? filters.countryCode,
            lang,
          )
        : t("where.all");

  const shipActive =
    (filters.shipsLocally ? 1 : 0) +
    (filters.shipsInternationally ? 1 : 0);

  return (
    <div className="filters filters--roasters" ref={rootRef}>
      <div className="roaster-channel" role="group" aria-label={t("roasters.buyingChannel")}>
        {(["all", "online", "inPerson"] as const).map((channel) => (
          <button
            key={channel}
            type="button"
            className={`roaster-channel__btn ${filters.buying === channel ? "is-on" : ""}`}
            aria-pressed={filters.buying === channel}
            onClick={() => setRoasterBuying(channel)}
          >
            {t(
              channel === "all"
                ? "roasters.channelAll"
                : channel === "online"
                  ? "roasters.channelOnline"
                  : "roasters.channelInPerson",
            )}
          </button>
        ))}
      </div>

      <div className="filters__search">
        <label className="sr-only" htmlFor="roaster-search">
          {t("search.label")}
        </label>
        <input
          id="roaster-search"
          type="search"
          value={filters.query}
          onChange={(e) => setRoasterQuery(e.target.value)}
          placeholder={t("roasters.searchPlaceholder")}
          autoComplete="off"
        />
      </div>

      <div className="filters__row">
        <button
          type="button"
          className={`chip ${menu === "where" || filters.countryCode || filters.city || filters.region ? "is-on" : ""}`}
          onClick={() => setMenu(menu === "where" ? null : "where")}
          aria-expanded={menu === "where"}
        >
          📍 {whereLabel}
        </button>
        <button
          type="button"
          className={`chip ${menu === "ship" || shipActive > 0 ? "is-on" : ""}`}
          onClick={() => setMenu(menu === "ship" ? null : "ship")}
          aria-expanded={menu === "ship"}
        >
          📦 {t("roasters.shipMenu")}
          {shipActive > 0 && <span className="chip__n">{shipActive}</span>}
        </button>
        {active > 0 && (
          <button type="button" className="chip chip--clear" onClick={resetRoasterFilters}>
            {t("filter.clear", { n: active })}
          </button>
        )}
      </div>

      {menu === "where" && (
        <div className="filters__panel" role="dialog" aria-label={t("where.prompt")}>
          <p className="filters__panel-title">{t("roasters.wherePrompt")}</p>
          <button
            type="button"
            className={`chip ${!filters.countryCode && !filters.city && !filters.region ? "is-on" : ""}`}
            onClick={() => {
              setRoasterCountry(null);
              setRoasterRegion(null);
            }}
          >
            {t("where.all")}
          </button>

          {!filters.countryCode ? (
            <div className="filters__groups">
              {byContinent.map((group) => (
                <div key={group.id} className="filters__group">
                  <h4>{group.label}</h4>
                  <div className="filters__chips">
                    {group.countries.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        className="chip"
                        onClick={() => setRoasterCountry(c.code)}
                      >
                        {countryName(c.code, c.country, lang)}
                        <span className="chip__n">{c.n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <button
                type="button"
                className="filters__back"
                onClick={() => {
                  setRoasterCountry(null);
                  setRoasterRegion(null);
                }}
              >
                ← {t("chain.back")}
              </button>
              <p className="filters__panel-title">
                {countryName(
                  filters.countryCode,
                  countries.find((c) => c.code === filters.countryCode)?.country ?? "",
                  lang,
                )}
              </p>

              {regions.length > 0 && (
                <>
                  <h4 className="filters__subhead">{t("roasters.region")}</h4>
                  <div className="filters__chips">
                    <button
                      type="button"
                      className={`chip ${!filters.region ? "is-on" : ""}`}
                      onClick={() => setRoasterRegion(null)}
                    >
                      {t("where.all")}
                    </button>
                    {regions.map((r) => (
                      <button
                        key={r.region}
                        type="button"
                        className={`chip ${filters.region === r.region ? "is-on" : ""}`}
                        onClick={() => setRoasterRegion(filters.region === r.region ? null : r.region)}
                      >
                        {r.region}
                        <span className="chip__n">{r.n}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <h4 className="filters__subhead">{t("where.city")}</h4>
              <div className="filters__chips">
                <button
                  type="button"
                  className={`chip ${!filters.city ? "is-on" : ""}`}
                  onClick={() => setRoasterCity(null)}
                >
                  {t("where.all")}
                </button>
                {cities.map((c) => (
                  <button
                    key={c.city}
                    type="button"
                    className={`chip ${filters.city === c.city ? "is-on" : ""}`}
                    onClick={() => setRoasterCity(filters.city === c.city ? null : c.city)}
                  >
                    {c.city}
                    <span className="chip__n">{c.n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {menu === "ship" && (
        <div className="filters__panel" role="dialog" aria-label={t("roasters.shipMenu")}>
          <p className="filters__panel-title">{t("roasters.shipPrompt")}</p>
          <div className="filters__chips">
            <button
              type="button"
              className={`chip ${filters.shipsLocally ? "is-on" : ""}`}
              onClick={toggleRoasterShipLocal}
            >
              {t("roasters.shipsLocally")}
            </button>
            <button
              type="button"
              className={`chip ${filters.shipsInternationally ? "is-on" : ""}`}
              onClick={toggleRoasterShipIntl}
            >
              {t("roasters.shipsInternationally")}
            </button>
          </div>
          <p className="field__hint">{t("roasters.shipHint")}</p>
        </div>
      )}
    </div>
  );
}
