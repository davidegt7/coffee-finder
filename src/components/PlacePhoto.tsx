import { useEffect, useState } from "react";
import type { Place } from "../types";
import { useT } from "../lib/useT";

/**
 * One photo rule everywhere: an image is public only after permission is
 * recorded. Until then the listing gets Coffee Finder's own artwork rather
 * than an unlicensed image or an anonymous grey box.
 */
export function PlacePhoto({ place, variant }: { place: Place; variant: "card" | "hero" }) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const showPhoto = place.photoApproved === true && Boolean(place.photoUrl) && !failed;

  useEffect(() => setFailed(false), [place.photoUrl]);

  if (showPhoto) {
    return (
      <>
        <img
          className={variant === "card" ? "card__photo" : undefined}
          src={place.photoUrl}
          alt={variant === "hero" ? place.name : ""}
          loading="lazy"
          onError={() => setFailed(true)}
        />
        {variant === "hero" && place.photoCredit && <figcaption>{place.photoCredit}</figcaption>}
      </>
    );
  }

  return (
    <div
      className={`place-photo-placeholder place-photo-placeholder--${variant}`}
      role={variant === "hero" ? "img" : undefined}
      aria-label={variant === "hero" ? t("photo.placeholderAlt", { name: place.name }) : undefined}
      aria-hidden={variant === "card" ? true : undefined}
    >
      <span className="place-photo-placeholder__brand" aria-hidden="true">
        Coffee<span>Finder</span>
      </span>
      <span className="place-photo-placeholder__cup" aria-hidden="true">☕</span>
      {variant === "hero" && (
        <>
          <strong>{place.name}</strong>
          <span className="place-photo-placeholder__soon">{t("photo.comingSoon")}</span>
        </>
      )}
    </div>
  );
}
