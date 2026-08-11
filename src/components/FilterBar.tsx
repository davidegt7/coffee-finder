import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import {
  activeFilterCount,
  cityCounts,
  comunaCounts,
  countryCounts,
  locationSuggestions,
  flagCounts,
  itemCounts,
  type ClaimStrictness,
} from "../lib/filters";
import { INTENTS } from "../lib/items";
import { useT } from "../lib/useT";
import {
  ATTR_GROUPS,
  CATEGORIES,
  CATEGORY_LABELS,
  CLAIM_LABELS,
  FLAG_KEYS,
  FLAG_LABELS,
} from "../types";
import { CONTINENT_LABELS, continentOf, countryName, type ContinentId } from "../lib/geography";

/** Retained for the unpublished characteristics data and editor workflow. */
const NEXT: Record<ClaimStrictness, ClaimStrictness> = { off: "some", some: "all", all: "off" };

type Menu = "where" | "attrs" | "category" | "item" | null;
const VISIBLE_CATEGORIES = CATEGORIES.filter((category) => category !== "cart");

/**
 * The path back out of a drilled-down menu.
 *
 * Every menu that hides the level you came from needs one of these, or the
 * choice you just made becomes the one you can't change. The last crumb is
 * where you are and is never a button; earlier ones with no handler are
 * disabled rather than removed, so the shape of the path doesn't jump around
 * as you move through it.
 */
function Trail({ crumbs, label }: { crumbs: { label: string; onClick?: () => void }[]; label: string }) {
  return (
    <nav className="drill-trail" aria-label={label}>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="drill-trail__step">
            {i > 0 && (
              <span className="drill-trail__sep" aria-hidden="true">
                ›
              </span>
            )}
            {last || !crumb.onClick ? (
              <span className={`drill-trail__crumb ${last ? "is-current" : ""}`}>{crumb.label}</span>
            ) : (
              <button type="button" className="drill-trail__crumb" onClick={crumb.onClick}>
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * The rail along the bottom of every step in the refine flow.
 *
 * "Next" is also the skip: someone with no opinion about place type should
 * pass it in one tap, and a separate Skip button would be two words for the
 * same motion. On the last step it says so, because "Next" pointing at nothing
 * is a small lie about how much is left.
 */
function ChainFooter({
  step,
  total,
  onBack,
  onNext,
  labels,
}: {
  step: number;
  total: number;
  onBack: (() => void) | null;
  onNext: () => void;
  labels: { back: string; next: string; done: string; step: string };
}) {
  return (
    <div className="chain-foot">
      {onBack ? (
        <button type="button" className="chain-foot__back" onClick={onBack}>
          ← {labels.back}
        </button>
      ) : (
        <span />
      )}
      <span className="chain-foot__step">{labels.step}</span>
      <button type="button" className="chain-foot__next" onClick={onNext}>
        {step === total ? labels.done : `${labels.next} →`}
      </button>
    </div>
  );
}

export function FilterBar({ onComplete }: { onComplete?: () => void }) {
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
    near,
    nearStatus,
    findNearMe,
    clearNear,
  } = useStore();
  const { t, lang } = useT();
  const [open, setOpen] = useState<Menu>(null);
  const [attrGroup, setAttrGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const strictnessHint: Record<ClaimStrictness, string> = {
    off: "",
    some: t("strictness.some"),
    all: t("strictness.all"),
  };

  const count = activeFilterCount(filters);
  const catCount = filters.categories.length;
  const itemCount = filters.items.length;

  const iCounts = useMemo(
    () => itemCounts(places, filters, INTENTS.map((intent) => intent.id)),
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
  /**
   * Which rung of the ladder the menu is showing. Derived from the filters
   * rather than held as its own state — a separate "step" variable would drift
   * the moment a country got cleared from anywhere else, and then the menu
   * would be showing cities for a country nobody had chosen.
   */
  const whereLevel: "country" | "city" | "comuna" = !filters.countryCode
    ? "country"
    : !filters.city
      ? "city"
      : "comuna";

  // Whether the level below has anything in it, asked BEFORE committing to a
  // choice, so a pick with nothing under it closes rather than opening onto an
  // empty panel.
  const citiesIn = (code: string) =>
    cityCounts(places, { ...filters, countryCode: code, city: null, comunas: [] }, code);
  const comunasIn = (city: string) =>
    comunaCounts(places, { ...filters, city, comunas: [] }, city);

  /**
   * Countries grouped by continent. The flat list was sorted by how many places
   * each country holds, which put Denmark between Chile and Canada — accurate,
   * and unreadable as geography. You know which continent you want before you
   * know which country, so that is the cut.
   *
   * Continents are ordered by what is actually on the map rather than
   * alphabetically or by some canonical order: an app with 45 places in the US
   * and none in Africa should not open on Africa.
   */
  const countriesByContinent = useMemo(() => {
    const groups = new Map<ContinentId, { code: string; n: number }[]>();
    for (const [code, n] of countries) {
      const id = continentOf(code);
      const list = groups.get(id) ?? [];
      list.push({ code, n });
      groups.set(id, list);
    }
    return [...groups.entries()]
      .map(([id, list]) => ({ id, list, total: list.reduce((sum, c) => sum + c.n, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [countries]);

  /** Locations matching what's typed, offered instead of a keyword match. */
  const suggestions = useMemo(
    () => locationSuggestions(places, filters.query),
    [places, filters.query],
  );

  /**
   * Take the location and hand over to the ladder at the rung below it —
   * choosing "Santiago" should leave you looking at its barrios, exactly as
   * picking Santiago from the menu would. The query is cleared because the
   * location filter now does the narrowing, and leaving the text behind would
   * quietly AND a keyword match on top of it.
   */
  const useSuggestion = (s: (typeof suggestions)[number]) => {
    setQuery("");
    setCountry(s.countryCode);
    if (s.city) setCity(s.city);
    if (s.comuna) toggleComuna(s.comuna);
    // A barrio is the bottom of the ladder: there is nothing left to choose, so
    // show the results rather than an empty rung.
    setOpen(s.comuna ? null : "where");
    if (s.comuna) onComplete?.();
  };

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

  /**
   * The two refining filters are one flow, not unrelated dropdowns.
   *
   * Location is not in it: it's the question you answer first and on its own,
   * and it already ends by closing onto results.
   */
  const CHAIN = ["item", "category"] as const;
  const stepIndex = CHAIN.indexOf(open as (typeof CHAIN)[number]);

  /** Each step opens at its own top level rather than wherever it was left. */
  const goToStep = (i: number) => {
    setOpen(i < 0 || i >= CHAIN.length ? null : CHAIN[i]);
  };

  /**
   * Advance after a choice — and after a skip, which is the same motion. The
   * last step closes the flow, because by then the thing worth looking at is
   * the list, not another panel.
   */
  const advance = () => goToStep(stepIndex + 1);
  const finish = () => {
    advance();
    onComplete?.();
  };

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

      {suggestions.length > 0 && (
        <ul className="place-hints">
          {suggestions.map((s) => (
            <li key={`${s.kind}:${s.countryCode}:${s.city ?? ""}:${s.comuna ?? ""}`}>
              <button className="place-hint" onClick={() => useSuggestion(s)}>
                <span className="place-hint__pin" aria-hidden="true">
                  📍
                </span>
                <span className="place-hint__label">
                  {s.label}
                  <small>
                    {t(
                      s.kind === "country"
                        ? "where.country"
                        : s.kind === "city"
                          ? "where.city"
                          : "where.comuna",
                    )}
                    {s.city && s.kind !== "city" && s.kind !== "country" ? ` · ${s.city}` : ""}
                  </small>
                </span>
                <span className="chip__n">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
          {/* ONE level at a time. Showing country, city and barrio stacked
              meant the answer to "where am I going" was a wall of chips whose
              lower half was usually irrelevant. Choosing a country replaces the
              countries with its cities, a city with its barrios, and the last
              choice closes the menu — because at that point the thing you came
              to see is the results, not more menu.

              The trail above is how you get back up: hiding the level you just
              left would otherwise make the choice unchangeable. */}
          {/* First, because it answers "where are you going" faster than any
              amount of drilling — and it is the only answer that needs the
              browser's permission, so its failures get said out loud rather
              than leaving a button that appears to do nothing. */}
          <button
            className={`near-btn ${near ? "is-on" : ""}`}
            onClick={async () => {
              if (near) return clearNear();
              await findNearMe();
              // Get out of the way. The point of "near me" is the map and the
              // cafés on it; leaving a country list open over both means the
              // answer arrives behind the question.
              if (useStore.getState().near) {
                setOpen(null);
                onComplete?.();
              }
            }}
            disabled={nearStatus === "locating"}
          >
            <span aria-hidden="true">🧭</span>
            {nearStatus === "locating"
              ? t("near.locating")
              : near
                ? `${t("near.on")} · ${t("near.clear")}`
                : t("near.cta")}
          </button>
          {(nearStatus === "denied" ||
            nearStatus === "unavailable" ||
            nearStatus === "timeout") && (
            <p className="field__err">{t(`near.${nearStatus}`)}</p>
          )}

          <Trail
            label={t("where.prompt")}
            crumbs={[
              { label: t("where.all"), onClick: () => setCountry(null) },
              ...(filters.countryCode
                ? [
                    {
                      label: countryName(
                        filters.countryCode,
                        places.find((p) => p.countryCode === filters.countryCode)?.country ??
                          filters.countryCode.toUpperCase(),
                        lang,
                      ),
                      onClick: () => setCity(null),
                    },
                  ]
                : []),
              ...(filters.city ? [{ label: filters.city }] : []),
            ]}
          />

          <div className="menu-panel__chips">
            {whereLevel === "country" &&
              countriesByContinent.map(({ id, list }) => (
                <div key={id} className="menu-panel__group">
                  <h4 className="menu-panel__group-title">{CONTINENT_LABELS[id][lang]}</h4>
                  <div className="menu-panel__chips">
                    {list.map(({ code, n }) => {
                      const fallback =
                        places.find((p) => p.countryCode === code)?.country ?? code;
                      return (
                        <button
                          key={code}
                          className="chip chip--cat"
                          onClick={() => {
                            setCountry(code);
                            // Nowhere left to drill: the menu has done its job.
                            if (citiesIn(code).size === 0) {
                              setOpen(null);
                              onComplete?.();
                            }
                          }}
                        >
                          {countryName(code, fallback, lang)}
                          <span className="chip__n">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

            {whereLevel === "city" &&
              [...cities.entries()].map(([city, n]) => (
                <button
                  key={city}
                  className="chip chip--cat"
                  onClick={() => {
                    setCity(city);
                    if (comunasIn(city).size === 0) {
                      setOpen(null);
                      onComplete?.();
                    }
                  }}
                >
                  {city}
                  <span className="chip__n">{n}</span>
                </button>
              ))}

            {whereLevel === "comuna" &&
              [...comunas.entries()].map(([c, n]) => (
                <button
                  key={c}
                  className={`chip chip--cat ${filters.comunas.includes(c) ? "is-on" : ""}`}
                  onClick={() => {
                    toggleComuna(c);
                    // Closes on the last level, as asked. Picking a second
                    // barrio means reopening — the menu comes back here, with
                    // the first one still lit.
                    setOpen(null);
                    onComplete?.();
                  }}
                  aria-pressed={filters.comunas.includes(c)}
                >
                  {c}
                  <span className="chip__n">{n}</span>
                </button>
              ))}
          </div>
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
          <div className="intents">
            {INTENTS.map((itemIntent) => {
              const on = filters.items.includes(itemIntent.id);
              const total = iCounts.get(itemIntent.id) ?? 0;
              return (
                <button
                  key={itemIntent.id}
                  className={`intent ${on ? "is-active" : ""}`}
                  onClick={() => {
                    toggleItem(itemIntent.id);
                    advance();
                  }}
                  aria-pressed={on}
                >
                  <span className="intent__icon" aria-hidden="true">
                    {itemIntent.icon}
                  </span>
                  <span className="intent__label">{itemIntent.label[lang]}</span>
                  <span className="intent__n">{total}</span>
                </button>
              );
            })}
          </div>

          <p className="menu-panel__hint">{t("item.pickIntent")}</p>

          <ChainFooter
            step={1}
            total={2}
            onBack={null}
            onNext={advance}
            labels={{
              back: t("chain.back"),
              next: t("chain.next"),
              done: t("chain.done"),
              step: t("chain.step", { n: 1, total: 2 }),
            }}
          />
        </div>
      )}

      {open === "attrs" && (
        <div className="menu-panel menu-panel--scroll" id="menu-attrs">
          {/* Claims and flags are interleaved by SUBJECT, not by mechanism — a
              visitor thinks "what about the coffee?", not "which of these
              carries provenance metadata?". Same drill-down as the others: all
              three subjects at once was most of a screen of chips to read
              before finding the one you came for. */}
          {attrGroup === null ? (
            <div className="intents">
              {ATTR_GROUPS.map((group) => {
                const chosen =
                  group.claims.filter((k) => filters.claims[k] !== "off").length +
                  group.flags.filter((k) => filters.flags.includes(k)).length;
                return (
                  <button
                    key={group.id}
                    className={`intent ${chosen ? "is-active" : ""}`}
                    onClick={() => setAttrGroup(group.id)}
                  >
                    <span className="intent__icon" aria-hidden="true">
                      {group.icon}
                    </span>
                    <span className="intent__label">{group.label[lang]}</span>
                    {chosen > 0 ? (
                      <span className="menu-btn__count">{chosen}</span>
                    ) : (
                      <span className="intent__n">{group.claims.length + group.flags.length}</span>
                    )}
                  </button>
                );
              })}

              {/* "Solo comprobado" and "Solo mis guardados" used to sit loose
                  under the three subjects as two big checkbox rows, so the
                  first thing you met in this menu was a wall of prose rather
                  than a choice. They are refinements of what to SHOW, not a
                  fourth subject, and behind a card of their own they stop
                  competing with the question actually being asked. */}
              <button
                className={`intent ${
                  filters.verifiedOnly || filters.savedOnly ? "is-active" : ""
                }`}
                onClick={() => setAttrGroup("only")}
              >
                <span className="intent__icon" aria-hidden="true">
                  👁
                </span>
                <span className="intent__label">{t("attrs.onlyShow")}</span>
                {filters.verifiedOnly || filters.savedOnly ? (
                  <span className="menu-btn__count">
                    {(filters.verifiedOnly ? 1 : 0) + (filters.savedOnly ? 1 : 0)}
                  </span>
                ) : (
                  <span className="intent__n">{session ? 2 : 1}</span>
                )}
              </button>
            </div>
          ) : attrGroup === "only" ? (
            <div>
              <Trail
                label={t("menu.attrs")}
                crumbs={[
                  { label: t("menu.attrs"), onClick: () => setAttrGroup(null) },
                  { label: t("attrs.onlyShow") },
                ]}
              />
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

              {/* Only offered when signed in — "my saved places" is a promise
                  the app can't keep for an anonymous visitor. */}
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
          ) : (
            ATTR_GROUPS.filter((g) => g.id === attrGroup).map((group) => (
              <div key={group.id}>
                <Trail
                  label={t("menu.attrs")}
                  crumbs={[
                    { label: t("menu.attrs"), onClick: () => setAttrGroup(null) },
                    { label: group.label[lang] },
                  ]}
                />
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
                        onClick={() => {
                          toggleFlag(key);
                          advance();
                        }}
                        aria-pressed={on}
                        title={n === 0 ? t("item.emptyTitle") : t("item.countTitle", { n })}
                      >
                        {FLAG_LABELS[key][lang]}
                        <span className="chip__n">{n}</span>
                      </button>
                    );
                  })}
                </div>
                {/* The tri-state is invisible until you know it's there, and
                    only claims have it — so it belongs with the claims, not
                    stranded at the foot of a menu you may never scroll. */}
                {group.claims.length > 0 && (
                  <p className="menu-panel__hint">
                    {t("attrs.claimHintA")} <strong>{t("attrs.claimHintOptions")}</strong>
                    {t("attrs.claimHintB")} <strong>{t("attrs.claimHint100")}</strong>.
                    <br />
                    {t("attrs.flagNote")}
                  </p>
                )}
              </div>
            ))
          )}


          <ChainFooter
            step={2}
            total={3}
            onBack={attrGroup ? () => setAttrGroup(null) : () => goToStep(0)}
            onNext={advance}
            labels={{
              back: t("chain.back"),
              next: t("chain.next"),
              done: t("chain.done"),
              step: t("chain.step", { n: 2, total: 3 }),
            }}
          />
        </div>
      )}

      {open === "category" && (
        <div className="menu-panel" id="menu-category">
          <div className="menu-panel__chips">
            {VISIBLE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`chip chip--cat ${filters.categories.includes(cat) ? "is-on" : ""}`}
                onClick={() => {
                  toggleCategory(cat);
                  finish();
                }}
                aria-pressed={filters.categories.includes(cat)}
              >
                <span aria-hidden="true">{CATEGORY_LABELS[cat].icon}</span>{" "}
                {CATEGORY_LABELS[cat][lang]}
              </button>
            ))}
          </div>

          <ChainFooter
            step={2}
            total={2}
            onBack={() => goToStep(0)}
            onNext={finish}
            labels={{
              back: t("chain.back"),
              next: t("chain.next"),
              done: t("chain.done"),
              step: t("chain.step", { n: 2, total: 2 }),
            }}
          />
        </div>
      )}
    </div>
  );
}
