import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import {
  activeFilterCount,
  cityCounts,
  comunaCounts,
  countryCounts,
  flagCounts,
  itemCounts,
  type ClaimStrictness,
} from "../lib/filters";
import { INTENTS, ITEMS, itemIdsForIntent, type ItemIntent } from "../lib/items";
import { useT } from "../lib/useT";
import {
  ATTR_GROUPS,
  CATEGORIES,
  CATEGORY_LABELS,
  CLAIM_LABELS,
  FLAG_KEYS,
  FLAG_LABELS,
} from "../types";
import { countryName } from "../lib/geography";

/** off → some → all → off. One tap deepens, three taps clears. */
const NEXT: Record<ClaimStrictness, ClaimStrictness> = { off: "some", some: "all", all: "off" };

type Menu = "where" | "attrs" | "category" | "item" | null;

export function FilterBar() {
  const {
    filters,
    setClaim,
    toggleFlag,
    toggleCategory,
    toggleItem,
    setQuery,
    setVerifiedOnly,
    setSavedOnly,
    setCountry,
    setCity,
    toggleComuna,
    resetFilters,
    places,
    favorites,
    session,
  } = useStore();
  const { t, lang } = useT();
  const [open, setOpen] = useState<Menu>(null);
  // Which top-level intent is expanded inside the "Qué buscas" menu.
  const [intent, setIntent] = useState<ItemIntent["id"] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const strictnessHint: Record<ClaimStrictness, string> = {
    off: "",
    some: t("strictness.some"),
    all: t("strictness.all"),
  };

  const count = activeFilterCount(filters);
  const attrCount =
    Object.values(filters.claims).filter((v) => v !== "off").length +
    filters.flags.length +
    (filters.verifiedOnly ? 1 : 0) +
    (filters.savedOnly ? 1 : 0);
  const catCount = filters.categories.length;
  const itemCount = filters.items.length;

  const iCounts = useMemo(
    () => itemCounts(places, filters, ITEMS.map((i) => i.id)),
    [places, filters],
  );
  const fCounts = useMemo(() => flagCounts(places, filters, [...FLAG_KEYS]), [places, filters]);
  const countries = useMemo(() => countryCounts(places, filters), [places, filters]);
  const cities = useMemo(
    () =>
      filters.countryCode
        ? cityCounts(places, filters, filters.countryCode)
        : new Map<string, number>(),
    [places, filters],
  );
  const comunas = useMemo(
    () => (filters.city ? comunaCounts(places, filters, filters.city) : new Map<string, number>()),
    [places, filters],
  );

  // What the location button says when closed. It's the first thing on screen,
  // so it has to read as an answer ("Providencia") rather than a control name.
  const whereLabel = filters.comunas.length
    ? filters.comunas.length === 1
      ? filters.comunas[0]
      : t("where.nComunas", { n: filters.comunas.length })
    : filters.city ??
      (filters.countryCode
        ? countryName(
            filters.countryCode,
            places.find((place) => place.countryCode === filters.countryCode)?.country ??
              filters.countryCode.toUpperCase(),
            lang,
          )
        : t("where.prompt"));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (menu: Exclude<Menu, null>) => setOpen((cur) => (cur === menu ? null : menu));

  return (
    <div className="filters" ref={rootRef}>
      <div className="filters__search">
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(null)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.label")}
        />
        {count > 0 && (
          <button className="filters__reset" onClick={resetFilters}>
            {t("filter.clear", { n: count })}
          </button>
        )}
      </div>

      {/* Location comes before everything: at global scale an unfiltered map
          is 600 pins and no answer. Rendered as its own row so it reads as the
          first question, not one chip among four. */}
      <button
        className={`where-btn ${open === "where" ? "is-open" : ""} ${filters.countryCode ? "is-active" : ""}`}
        onClick={() => toggle("where")}
        aria-expanded={open === "where"}
        aria-controls="menu-where"
      >
        <span className="where-btn__pin" aria-hidden="true">
          📍
        </span>
        <span className="where-btn__label">{whereLabel}</span>
        <span className="menu-btn__caret" aria-hidden="true" />
      </button>

      {open === "where" && (
        <div className="menu-panel menu-panel--scroll" id="menu-where">
          <button
            className={`chip chip--cat ${!filters.countryCode ? "is-on" : ""}`}
            onClick={() => {
              setCountry(null);
              setOpen(null);
            }}
          >
            {t("where.all")} <span className="chip__n">{places.length}</span>
          </button>

          <div className="menu-panel__group">
            <h4 className="menu-panel__group-title">{t("where.country")}</h4>
            <div className="menu-panel__chips">
              {[...countries.entries()].map(([code, n]) => {
                const fallback = places.find((place) => place.countryCode === code)?.country ?? code;
                return (
                <button
                  key={code}
                  className={`chip chip--cat ${filters.countryCode === code ? "is-on" : ""}`}
                  onClick={() => setCountry(filters.countryCode === code ? null : code)}
                  aria-pressed={filters.countryCode === code}
                >
                  {countryName(code, fallback, lang)}
                  <span className="chip__n">{n}</span>
                </button>
                );
              })}
            </div>
          </div>

          {filters.countryCode && cities.size > 0 && (
            <div className="menu-panel__group">
              <h4 className="menu-panel__group-title">{t("where.city")}</h4>
              <div className="menu-panel__chips">
                {[...cities.entries()].map(([city, n]) => (
                  <button
                    key={city}
                    className={`chip chip--cat ${filters.city === city ? "is-on" : ""}`}
                    onClick={() => setCity(filters.city === city ? null : city)}
                    aria-pressed={filters.city === city}
                  >
                    {city}
                    <span className="chip__n">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filters.city && comunas.size > 0 && (
            <div className="menu-panel__group">
              <h4 className="menu-panel__group-title">{t("where.comuna")}</h4>
              <div className="menu-panel__chips">
                {[...comunas.entries()].map(([c, n]) => (
                  <button
                    key={c}
                    className={`chip chip--cat ${filters.comunas.includes(c) ? "is-on" : ""}`}
                    onClick={() => toggleComuna(c)}
                    aria-pressed={filters.comunas.includes(c)}
                  >
                    {c}
                    <span className="chip__n">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="filters__menus">
        <button
          className={`menu-btn ${open === "item" ? "is-open" : ""} ${itemCount ? "is-active" : ""}`}
          onClick={() => toggle("item")}
          aria-expanded={open === "item"}
          aria-controls="menu-item"
        >
          {t("menu.item")}
          {itemCount > 0 && <span className="menu-btn__count">{itemCount}</span>}
          <span className="menu-btn__caret" aria-hidden="true" />
        </button>

        <button
          className={`menu-btn ${open === "attrs" ? "is-open" : ""} ${attrCount ? "is-active" : ""}`}
          onClick={() => toggle("attrs")}
          aria-expanded={open === "attrs"}
          aria-controls="menu-attrs"
        >
          {t("menu.attrs")}
          {attrCount > 0 && <span className="menu-btn__count">{attrCount}</span>}
          <span className="menu-btn__caret" aria-hidden="true" />
        </button>

        <button
          className={`menu-btn ${open === "category" ? "is-open" : ""} ${catCount ? "is-active" : ""}`}
          onClick={() => toggle("category")}
          aria-expanded={open === "category"}
          aria-controls="menu-category"
        >
          {t("menu.category")}
          {catCount > 0 && <span className="menu-btn__count">{catCount}</span>}
          <span className="menu-btn__caret" aria-hidden="true" />
        </button>
      </div>

      {open === "item" && (
        <div className="menu-panel menu-panel--scroll" id="menu-item">
          {/* Top level is the errand: drinking here, buying beans, buying gear.
              Someone after a bag of beans has no use for a list of espresso
              drinks, so only the chosen branch expands. */}
          <div className="intents">
            {INTENTS.map((it) => {
              const ids = itemIdsForIntent(it.id);
              const chosen = ids.filter((id) => filters.items.includes(id)).length;
              const total = ids.reduce((n, id) => n + (iCounts.get(id) ?? 0), 0);
              return (
                <button
                  key={it.id}
                  className={`intent ${intent === it.id ? "is-open" : ""} ${chosen ? "is-active" : ""}`}
                  onClick={() => setIntent(intent === it.id ? null : it.id)}
                  aria-expanded={intent === it.id}
                >
                  <span className="intent__icon" aria-hidden="true">
                    {it.icon}
                  </span>
                  <span className="intent__label">{it.label[lang]}</span>
                  {chosen > 0 ? (
                    <span className="menu-btn__count">{chosen}</span>
                  ) : (
                    <span className="intent__n">{total}</span>
                  )}
                </button>
              );
            })}
          </div>

          {INTENTS.filter((it) => it.id === intent).map((it) => (
            <div key={it.id} className="intent-panel">
              {it.sections.map((section) => (
                <div key={section.id} className="menu-panel__group">
                  {section.label && (
                    <h4 className="menu-panel__group-title">{section.label[lang]}</h4>
                  )}
                  <div className="menu-panel__chips">
                    {[...section.items]
                      // Real options first: with most of the map untagged,
                      // alphabetical would bury the few that work under zeros.
                      .sort((a, b) => (iCounts.get(b.id) ?? 0) - (iCounts.get(a.id) ?? 0))
                      .map((item) => {
                        const n = iCounts.get(item.id) ?? 0;
                        const on = filters.items.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            className={`chip chip--item ${on ? "is-on" : ""} ${n === 0 ? "is-empty" : ""}`}
                            onClick={() => toggleItem(item.id)}
                            aria-pressed={on}
                            title={n === 0 ? t("item.emptyTitle") : t("item.countTitle", { n })}
                          >
                            {item.label[lang]}
                            <span className="chip__n">{n}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {intent === null && <p className="menu-panel__hint">{t("item.pickIntent")}</p>}
          {intent !== null && (
            <p className="menu-panel__hint">
              {t("item.hintA")} <strong>{t("menu.attrs")}</strong> {t("item.hintB")}{" "}
              <strong>0</strong> {t("item.hintC")}
            </p>
          )}
        </div>
      )}

      {open === "attrs" && (
        <div className="menu-panel menu-panel--scroll" id="menu-attrs">
          {/* Claims and flags are interleaved by SUBJECT, not by mechanism — a
              visitor thinks "what about the coffee?", not "which of these
              carries provenance metadata?". */}
          {ATTR_GROUPS.map((group) => (
            <div key={group.id} className="menu-panel__group">
              <h4 className="menu-panel__group-title">{group.label[lang]}</h4>
              <div className="menu-panel__chips">
                {group.claims.map((key) => {
                  const value = filters.claims[key];
                  return (
                    <button
                      key={key}
                      className={`chip chip--claim is-${value}`}
                      onClick={() => setClaim(key, NEXT[value])}
                      aria-pressed={value !== "off"}
                    >
                      {CLAIM_LABELS[key][lang]}
                      {value !== "off" && (
                        <span className="chip__hint">{strictnessHint[value]}</span>
                      )}
                    </button>
                  );
                })}
                {group.flags.map((key) => {
                  const n = fCounts.get(key) ?? 0;
                  const on = filters.flags.includes(key);
                  return (
                    <button
                      key={key}
                      className={`chip chip--flag ${on ? "is-on" : ""} ${n === 0 ? "is-empty" : ""}`}
                      onClick={() => toggleFlag(key)}
                      aria-pressed={on}
                      title={n === 0 ? t("item.emptyTitle") : t("item.countTitle", { n })}
                    >
                      {FLAG_LABELS[key][lang]}
                      <span className="chip__n">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* The tri-state is invisible until you know it's there. Say it once. */}
          <p className="menu-panel__hint">
            {t("attrs.claimHintA")} <strong>{t("attrs.claimHintOptions")}</strong>
            {t("attrs.claimHintB")} <strong>{t("attrs.claimHint100")}</strong>.
            <br />
            {t("attrs.flagNote")}
          </p>

          <label className="menu-panel__verified">
            <input
              type="checkbox"
              checked={filters.verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            <span>
              {t("verified.label")}
              <small>{t("verified.desc")}</small>
            </span>
          </label>

          {/* Only offered when signed in — "my saved places" is a promise the
              app can't keep for an anonymous visitor. */}
          {session && (
            <label className="menu-panel__verified">
              <input
                type="checkbox"
                checked={filters.savedOnly}
                onChange={(e) => setSavedOnly(e.target.checked)}
              />
              <span>
                {t("fav.onlySaved")}
                <small>{t("fav.onlySavedDesc", { n: favorites.length })}</small>
              </span>
            </label>
          )}
        </div>
      )}

      {open === "category" && (
        <div className="menu-panel" id="menu-category">
          <div className="menu-panel__chips">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`chip chip--cat ${filters.categories.includes(cat) ? "is-on" : ""}`}
                onClick={() => toggleCategory(cat)}
                aria-pressed={filters.categories.includes(cat)}
              >
                <span aria-hidden="true">{CATEGORY_LABELS[cat].icon}</span>{" "}
                {CATEGORY_LABELS[cat][lang]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
