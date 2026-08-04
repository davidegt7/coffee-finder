import { useMemo, useState } from "react";
import { useStore } from "../store";
import { reviewsFor, type Review } from "../lib/reviews";
import { signInWithEmail, signOut } from "../lib/auth";
import { directionsUrl, instagramUrl } from "../lib/links";
import { placeUrl } from "../lib/placeUrl";
import { useT } from "../lib/useT";
import { useSwipeToDismiss } from "../lib/useSwipeToDismiss";
import { ClaimBadge, ClaimRow, UnknownClaims } from "./ClaimBadge";
import { OAuthButtons } from "./OAuthButtons";
import { AdSlot } from "./AdSlot";
import { CATEGORY_LABELS, CLAIM_KEYS, CLAIM_LABELS, FLAG_LABELS, type ClaimKey } from "../types";
import { countryName } from "../lib/geography";

/**
 * Signing in is required to review. That's friction on purpose: an open write
 * endpoint on a public map is a spam magnet, and an unattributable review is
 * worth little to a reader. Magic link is the cheapest real identity there is.
 */
function SignInToReview() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="review-signin__msg">
        {t("admin.linkSentA")} <strong>{email}</strong>
        {t("admin.linkSentB")}
      </p>
    );
  }

  return (
    <form
      className="review-signin"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const { error } = await signInWithEmail(email);
        setBusy(false);
        if (error) setErr(error);
        else setSent(true);
      }}
    >
      <p className="review-signin__why">{t("review.signInWhy")}</p>
      <OAuthButtons />
      <div className="review-signin__row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("admin.emailPlaceholder")}
          aria-label="Email"
        />
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "…" : t("review.signInCta")}
        </button>
      </div>
      {err && <p className="field__err">{err}</p>}
    </form>
  );
}

function ReviewForm({ placeId, onDone }: { placeId: string; onDone: () => void }) {
  const submitReview = useStore((s) => s.submitReview);
  const isEditor = useStore((s) => s.isEditor);
  const { t, lang } = useT();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [speaksTo, setSpeaksTo] = useState<ClaimKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = body.trim().length > 2 && !busy;

  return (
    <form
      className="review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setErr(null);
        const res = await submitReview({
          placeId,
          rating,
          body: body.trim(),
          author: author.trim() || t("common.anon"),
          speaksTo,
        });
        setBusy(false);
        if (res.error) setErr(res.error);
        else onDone();
      }}
    >
      {isEditor && <p className="review-form__team">{t("review.willBePinned")}</p>}
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
      {err && <p className="field__err">{err}</p>}
      <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
        {busy ? t("editor.saving") : t("review.publish")}
      </button>
    </form>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const { t, lang } = useT();
  return (
    <article className={`review ${review.isTeam ? "review--team" : ""}`}>
      <div className="review__head">
        <strong>{review.author}</strong>
        {review.isTeam && <span className="review__team-badge">{t("review.teamBadge")}</span>}
        <span className="review__stars">{"★".repeat(review.rating)}</span>
        <time>{review.createdAt.slice(0, 10)}</time>
      </div>
      <p>{review.body}</p>
      {review.speaksTo.length > 0 && (
        <p className="review__speaks">
          {t("sheet.speaksOf")} {review.speaksTo.map((k) => CLAIM_LABELS[k][lang]).join(", ")}
        </p>
      )}
    </article>
  );
}

export function PlaceSheet() {
  const selectedId = useStore((s) => s.selectedId);
  const places = useStore((s) => s.places);
  const allReviews = useStore((s) => s.reviews);
  const select = useStore((s) => s.select);
  const isEditor = useStore((s) => s.isEditor);
  const session = useStore((s) => s.session);
  const setEditing = useStore((s) => s.setEditing);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const favorites = useStore((s) => s.favorites);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const { t, lang } = useT();
  const [writing, setWriting] = useState(false);
  // Collapsed by default: the evidence is long, and the summary in the header
  // already answers the question the section exists to answer.
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const swipe = useSwipeToDismiss(() => select(null));

  const place = places.find((p) => p.id === selectedId);

  /**
   * Native share sheet where the device has one, clipboard otherwise. A user
   * dismissing the share sheet throws AbortError, which is a decision rather
   * than a failure and must not fall through to a silent copy.
   */
  const share = async () => {
    if (!place) return;
    const url = placeUrl(place.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: place.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2_000);
    } catch {
      // Cancelled, or a browser that permits neither. Nothing to report: the
      // link is in the address bar either way.
    }
  };
  const reviews = useMemo(
    () => (place ? reviewsFor(place.id, allReviews) : []),
    [place, allReviews],
  );

  if (!place) return null;

  const teamCount = reviews.filter((r) => r.isTeam).length;
  const unknownKeys = CLAIM_KEYS.filter((k) => place.claims[k].scope === "unknown");
  const isFav = favorites.includes(place.id);

  return (
    <div
      className={`sheet sheet--place ${swipe.dragging ? "is-dragging" : ""}`}
      role="dialog"
      aria-label={place.name}
      ref={swipe.ref}
      style={swipe.style}
    >
      <div className="sheet__drag" {...swipe.handlers}>
        <span className="sheet__grip" aria-hidden="true" />
      </div>
      <button className="sheet__close" onClick={() => select(null)} aria-label={t("common.close")}>
        ✕
      </button>

      {/* The photo drags too. It sits between the grab strip and the header, so
          on a phone it is the largest thing under your thumb and the obvious
          place to pull from — and while it was inert, sheets for places WITH a
          photo felt broken while ones without slid fine. */}
      {place.photoUrl && (
        <figure className="sheet__photo" {...swipe.handlers}>
          <img
            src={place.photoUrl}
            alt={place.name}
            loading="lazy"
            onError={(e) => {
              // Hide the whole figure, not just the img — a caption under a
              // broken image is worse than no photo at all.
              (e.currentTarget.closest("figure") as HTMLElement).style.display = "none";
            }}
          />
          {place.photoCredit && <figcaption>{place.photoCredit}</figcaption>}
        </figure>
      )}

      <header className="sheet__head" {...swipe.handlers}>
        <span className="sheet__cat">
          {CATEGORY_LABELS[place.category].icon} {CATEGORY_LABELS[place.category][lang]}
        </span>
        <div className="sheet__title-row">
          <h2>{place.name}</h2>
          {session && (
            <button
              className={`fav ${isFav ? "is-on" : ""}`}
              onClick={() => toggleFavorite(place.id)}
              aria-pressed={isFav}
              title={isFav ? t("fav.saved") : t("fav.save")}
            >
              {isFav ? "♥" : "♡"}
            </button>
          )}
        </div>
        {place.address && (
          <p className="sheet__addr">
            {place.address}
            {place.comuna && `, ${place.comuna}`}
            {place.city && `, ${place.city}`}
            {place.country && `, ${countryName(place.countryCode, place.country, lang)}`}
          </p>
        )}
        <div className="sheet__links">
          <a
            href={directionsUrl(place.lat, place.lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("sheet.directions")}
          </a>
          {/* The address bar already carries this café's link; this is for the
              phones where nobody can see the address bar to copy it. Native
              share sheet where there is one, clipboard everywhere else. */}
          <button className="link-like" onClick={() => void share()}>
            {shared ? t("sheet.shareDone") : t("sheet.share")}
          </button>
          {place.website && (
            <a href={place.website} target="_blank" rel="noopener noreferrer">
              {t("sheet.website")}
            </a>
          )}
          {place.instagram && (
            <a
              className="link--ig"
              href={instagramUrl(place.instagram)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* Drawn rather than fetched: an <img> to Instagram's CDN would
                  be a third-party request on every listing, and a broken icon
                  the day they move it. Inherits colour from the link. */}
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
                <rect
                  x="2.5"
                  y="2.5"
                  width="19"
                  height="19"
                  rx="5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
              </svg>
              {t("sheet.instagram")}
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
        <div className="claims-head">
          <button
            className="claims-toggle"
            onClick={() => setClaimsOpen((o) => !o)}
            aria-expanded={claimsOpen}
            aria-controls="claims-body"
          >
            <h3>{t("sheet.whatWeKnow")}</h3>
            <span className={`claims-toggle__caret ${claimsOpen ? "is-open" : ""}`} aria-hidden="true" />
          </button>
          {isEditor && (
            <button className="sheet__edit" onClick={() => setEditing(place)}>
              {t("sheet.edit")}
            </button>
          )}
        </div>

        {/* Collapsed still shows WHAT is known — only the evidence (notes,
            sources, dates) is behind the tap. Hiding the answer itself would
            trade clutter for uselessness. */}
        {!claimsOpen && (
          <div className="claims-summary" onClick={() => setClaimsOpen(true)}>
            {CLAIM_KEYS.map((key) => (
              <ClaimBadge key={key} claimKey={key} claim={place.claims[key]} />
            ))}
            {unknownKeys.length > 0 && (
              <span className="badge badge--flag">
                {unknownKeys.length} {t("claim.uncheckedShort")}
              </span>
            )}
          </div>
        )}

        {claimsOpen && (
          <div id="claims-body">
            {CLAIM_KEYS.map((key) => (
              <ClaimRow key={key} claimKey={key} claim={place.claims[key]} />
            ))}
            <UnknownClaims keys={unknownKeys} />
          </div>
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

        {/* Team reviews render first with a badge. The pinning is real:
            reviewsFor() returns them as a separate leading block, and `isTeam`
            comes from the database, not from anything the client can set. */}
        {reviews.map((r, i) => (
          <div key={r.id}>
            {i === teamCount && teamCount > 0 && (
              <p className="review__divider">{t("review.fromEveryone")}</p>
            )}
            <ReviewCard review={r} />
          </div>
        ))}

        {writing ? (
          <ReviewForm placeId={place.id} onDone={() => setWriting(false)} />
        ) : session ? (
          <>
            <button className="btn" onClick={() => setWriting(true)}>
              {t("sheet.writeReview")}
            </button>
            {/* Whoever is signed in needs to be able to see that, and to get out
                of it. Without this a reader who signed in once to review is
                stuck as that identity forever, with nothing on screen saying so
                — and on a shared phone the next person reviews as them. */}
            <p className="review-whoami">
              {t("review.signedInAs")} <strong>{session.user.email}</strong>{" "}
              <button
                className="linkish"
                onClick={async () => {
                  await signOut();
                  await refreshAuth();
                }}
              >
                {t("admin.signOut")}
              </button>
            </p>
          </>
        ) : (
          <SignInToReview />
        )}
      </section>

      {/* Caveats sit at the end rather than under the address. They're a
          footnote about the record, and interrupting the header with one pushed
          the actual content down on every place that had it. */}
      {place.caveat && (
        <p className="sheet__caveat">
          <strong>{t("sheet.caveat")}</strong> {place.caveat}
        </p>
      )}

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
