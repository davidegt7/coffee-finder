import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { activeFilterCount, flagCounts, itemCounts, type ClaimStrictness } from "../lib/filters";
import { GROUP_LABELS, ITEMS, itemsForGroup, type ItemGroup } from "../lib/items";
import { useT } from "../lib/useT";
import {
  ATTR_GROUPS,
  CATEGORIES,
  CATEGORY_LABELS,
  CLAIM_LABELS,
  FLAG_KEYS,
  FLAG_LABELS,
} from "../types";

/** off → some → all → off. One tap deepens, three taps clears. */
const NEXT: Record<ClaimStrictness, ClaimStrictness> = { off: "some", some: "all", all: "off" };

const ITEM_GROUPS: ItemGroup[] = ["drink", "eat", "take"];

type Menu = "attrs" | "category" | "item" | null;

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
    resetFilters,
    places,
    favorites,
    session,
  } = useStore();
  const { t, lang } = useT();
  const [open, setOpen] = useState<Menu>(null);
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
          {ITEM_GROUPS.map((group) => (
            <div key={group} className="menu-panel__group">
              <h4 className="menu-panel__group-title">{GROUP_LABELS[group][lang]}</h4>
              <div className="menu-panel__chips">
                {itemsForGroup(group)
                  // Real options first: with most of the map untagged, alphabetical
                  // would bury the few that work under a wall of zeros.
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
          <p className="menu-panel__hint">
            {t("item.hintA")} <strong>{t("menu.attrs")}</strong> {t("item.hintB")}{" "}
            <strong>0</strong> {t("item.hintC")}
          </p>
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
