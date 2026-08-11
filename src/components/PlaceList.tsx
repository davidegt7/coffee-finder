import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters } from "../lib/filters";
import { distanceKm, formatDistance } from "../lib/geo";
import { useT } from "../lib/useT";
import { ClaimBadge } from "./ClaimBadge";
import { AdSlot } from "./AdSlot";
import { CATEGORY_LABELS, CLAIM_KEYS, FLAG_LABELS } from "../types";
import { countryName } from "../lib/geography";

export function PlaceList() {
  const places = useStore((s) => s.places);
  const filters = useStore((s) => s.filters);
  const select = useStore((s) => s.select);
  const resetFilters = useStore((s) => s.resetFilters);
  const setSubmitOpen = useStore((s) => s.setSubmitOpen);
  const setBeansOpen = useStore((s) => s.setBeansOpen);
  const near = useStore((s) => s.near);
  const { t, lang } = useT();
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const session = useStore((s) => s.session);
  const visible = useMemo(() => {
    const matched = applyFilters(places, filters, favorites);
    // Nearest first once we know where you are. Sorted rather than cut off at a
    // radius: a hard cutoff turns "nothing within 2km" into an empty screen,
    // when "the closest is 6km away" is the more useful answer.
    if (!near) return matched;
    return [...matched].sort(
      (a, b) =>
        distanceKm(near, { lat: a.lat, lng: a.lng }) -
        distanceKm(near, { lat: b.lat, lng: b.lng }),
    );
  }, [places, filters, favorites, near]);

  if (visible.length === 0) {
    return (
      <div className="list list--empty">
        <p>{t("list.emptyTitle")}</p>
        <p className="list__hint">
          {filters.verifiedOnly ? t("list.emptyVerified") : t("list.emptyHint")}
        </p>
        <button className="btn" onClick={resetFilters}>
          {t("list.clearFilters")}
        </button>
      </div>
    );
  }

  return (
    <div className="list">
      <button className="beans-cta beans-cta--secondary" onClick={() => setBeansOpen(true)}>
        {t("beans.cta")}
      </button>

      {visible.map((place, i) => (
        <div key={place.id}>
          <button className="card" onClick={() => select(place.id)}>
            <div className="card__head">
              {place.photoUrl ? (
                <img
                  className="card__photo"
                  src={place.photoUrl}
                  alt=""
                  loading="lazy"
                  // A dead link would otherwise leave a broken-image glyph,
                  // which looks worse than never having had a photo.
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="card__cat" aria-hidden="true">
                  {CATEGORY_LABELS[place.category].icon}
                </span>
              )}
              <div className="card__title">
                <h3>{place.name}</h3>
                <p className="card__comuna">
                  {[place.comuna ?? place.city, countryName(place.countryCode, place.country, lang)]
                    .filter(Boolean)
                    .join(" · ")}
                  {/* Only while sorting by distance — a number with nothing to
                      measure from would be decoration. */}
                  {near && (
                    <span className="card__distance">
                      {formatDistance(distanceKm(near, { lat: place.lat, lng: place.lng }), lang)}
                    </span>
                  )}
                </p>
              </div>
              {session && (
                // A span, not a button: this sits inside the card's own <button>
                // and nesting buttons is invalid HTML that browsers silently
                // restructure, which breaks the click target.
                <span
                  role="button"
                  tabIndex={0}
                  className={`fav fav--card ${favorites.includes(place.id) ? "is-on" : ""}`}
                  aria-pressed={favorites.includes(place.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFavorite(place.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      void toggleFavorite(place.id);
                    }
                  }}
                >
                  {favorites.includes(place.id) ? "♥" : "♡"}
                </span>
              )}
            </div>
            <div className="card__badges">
              {CLAIM_KEYS.map((key) => (
                <ClaimBadge key={key} claimKey={key} claim={place.claims[key]} />
              ))}
              {/* Amenities ride along as quiet chips — no provenance mark, because
                  they carry none and pretending otherwise would be dishonest. */}
              {place.flags.slice(0, 3).map((f) => (
                <span key={f} className="badge badge--flag">
                  {FLAG_LABELS[f][lang]}
                </span>
              ))}
            </div>
            {place.items.length > 0 && (
              <p className="card__items">{place.items.slice(0, 4).join(" · ")}</p>
            )}
          </button>
          {/* One slot, a third of the way down — enough to be seen, not enough to be the product. */}
          {i === 2 && <AdSlot where="list" />}
        </div>
      ))}

      {/* Owner CTA lives at the end of the list rather than floating over it.
          It's a rare action for a different audience, and a fixed pill in the
          thumb zone was covering a card on every screen. */}
      <button className="owner-cta" onClick={() => setSubmitOpen(true)}>
        {t("submit.cta")}
      </button>
    </div>
  );
}
