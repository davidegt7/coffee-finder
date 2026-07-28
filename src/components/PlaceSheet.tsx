import { useMemo, useState } from "react";
import { useStore } from "../store";
import { reviewsFor } from "../lib/places";
import { useT } from "../lib/useT";
import { ClaimRow } from "./ClaimBadge";
import { AdSlot } from "./AdSlot";
import {
  CATEGORY_LABELS,
  CLAIM_KEYS,
  CLAIM_LABELS,
  FLAG_LABELS,
  type ClaimKey,
} from "../types";

function ReviewForm({ placeId, onDone }: { placeId: string; onDone: () => void }) {
  const submitReview = useStore((s) => s.submitReview);
  const { t, lang } = useT();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [speaksTo, setSpeaksTo] = useState<ClaimKey[]>([]);

  const canSubmit = body.trim().length > 2;

  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        submitReview({
          placeId,
          rating,
          body: body.trim(),
          author: author.trim() || t("common.anon"),
          speaksTo,
        });
        onDone();
      }}
    >
      <div className="review-form__stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star ${n <= rating ? "is-on" : ""}`}
            onClick={() => setRating(n)}
            aria-label={t("review.ratingLabel", { n })}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("review.bodyPlaceholder")}
        rows={3}
      />
      <input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder={t("review.namePlaceholder")}
      />
      <fieldset className="review-form__speaks">
        <legend>{t("review.speaksLegend")}</legend>
        {CLAIM_KEYS.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={speaksTo.includes(key)}
              onChange={(e) =>
                setSpeaksTo((prev) =>
                  e.target.checked ? [...prev, key] : prev.filter((k) => k !== key),
                )
              }
            />
            {CLAIM_LABELS[key][lang]}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
        {t("review.publish")}
      </button>
      <p className="review-form__local">{t("review.localNote")}</p>
    </form>
  );
}

export function PlaceSheet() {
  const selectedId = useStore((s) => s.selectedId);
  const places = useStore((s) => s.places);
  const allReviews = useStore((s) => s.reviews);
  const select = useStore((s) => s.select);
  const isEditor = useStore((s) => s.isEditor);
  const setEditing = useStore((s) => s.setEditing);
  const { t, lang } = useT();
  const [writing, setWriting] = useState(false);

  const place = places.find((p) => p.id === selectedId);
  const reviews = useMemo(
    () => (place ? reviewsFor(place.id, allReviews) : []),
    [place, allReviews],
  );

  if (!place) return null;

  const unknownCount = CLAIM_KEYS.filter((k) => place.claims[k].scope === "unknown").length;

  return (
    <div className="sheet" role="dialog" aria-label={place.name}>
      <button className="sheet__close" onClick={() => select(null)} aria-label={t("common.close")}>
        ✕
      </button>

      <header className="sheet__head">
        <span className="sheet__cat">
          {CATEGORY_LABELS[place.category].icon} {CATEGORY_LABELS[place.category][lang]}
        </span>
        <h2>{place.name}</h2>
        {place.address && (
          <p className="sheet__addr">
            {place.address}
            {place.comuna && `, ${place.comuna}`}
          </p>
        )}
        {place.caveat && (
          <p className="sheet__caveat">
            <strong>{t("sheet.caveat")}</strong> {place.caveat}
          </p>
        )}
        <div className="sheet__links">
          <a
            href={`https://www.openstreetmap.org/directions?to=${place.lat},${place.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("sheet.directions")}
          </a>
          {place.website && (
            <a href={place.website} target="_blank" rel="noopener noreferrer">
              {t("sheet.website")}
            </a>
          )}
          {place.instagram && (
            <a
              href={`https://instagram.com/${place.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {place.instagram}
            </a>
          )}
        </div>
      </header>

      {place.items.length > 0 && (
        <section className="sheet__section">
          <h3>{t("sheet.whatYouFind")}</h3>
          <div className="sheet__items">
            {place.items.map((item) => (
              <span key={item} className="chip chip--static">
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="sheet__section">
        <h3>
          {t("sheet.whatWeKnow")}
          {isEditor && (
            <button className="sheet__edit" onClick={() => setEditing(place)}>
              {t("sheet.edit")}
            </button>
          )}
        </h3>
        {CLAIM_KEYS.map((key) => (
          <ClaimRow key={key} claimKey={key} claim={place.claims[key]} />
        ))}
        {unknownCount > 0 && (
          <p className="sheet__gap-note">{t("sheet.gapNote", { n: unknownCount })}</p>
        )}
      </section>

      {place.flags.length > 0 && (
        <section className="sheet__section">
          <h3>{t("sheet.amenities")}</h3>
          <div className="sheet__items">
            {place.flags.map((f) => (
              <span key={f} className="chip chip--static">
                {FLAG_LABELS[f][lang]}
              </span>
            ))}
          </div>
        </section>
      )}

      <AdSlot where="detail" />

      <section className="sheet__section">
        <h3>
          {t("sheet.reviews")}{" "}
          {reviews.length > 0 && <span className="count">{reviews.length}</span>}
        </h3>
        {reviews.length === 0 && !writing && <p className="sheet__empty">{t("sheet.noReviews")}</p>}
        {reviews.map((r) => (
          <article key={r.id} className="review">
            <div className="review__head">
              <strong>{r.author}</strong>
              <span className="review__stars">{"★".repeat(r.rating)}</span>
              <time>{r.createdAt.slice(0, 10)}</time>
            </div>
            <p>{r.body}</p>
            {r.speaksTo.length > 0 && (
              <p className="review__speaks">
                {t("sheet.speaksOf")} {r.speaksTo.map((k) => CLAIM_LABELS[k][lang]).join(", ")}
              </p>
            )}
          </article>
        ))}
        {writing ? (
          <ReviewForm placeId={place.id} onDone={() => setWriting(false)} />
        ) : (
          <button className="btn" onClick={() => setWriting(true)}>
            {t("sheet.writeReview")}
          </button>
        )}
      </section>

      <footer className="sheet__sources">
        <h4>{t("sheet.sources")}</h4>
        <ul>
          {place.sources.map((s) => (
            <li key={s}>
              {s.startsWith("http") ? (
                <a href={s} target="_blank" rel="noopener noreferrer">
                  {new URL(s).hostname.replace(/^www\./, "")}
                </a>
              ) : (
                s
              )}
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
