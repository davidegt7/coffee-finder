import { useState } from "react";
import { useStore } from "../store";
import { geocode, type GeocodeHit } from "../lib/geocode";
import { uploadPlacePhoto } from "../lib/photos";
import { ITEMS } from "../lib/items";
import { useT } from "../lib/useT";
import type { StringKey } from "../lib/i18n";
import {
  ATTR_GROUPS,
  CATEGORIES,
  CATEGORY_LABELS,
  CLAIM_KEYS,
  CLAIM_LABELS,
  FLAG_LABELS,
  UNKNOWN_CLAIM,
  type Claim,
  type ClaimConfidence,
  type ClaimKey,
  type ClaimScope,
  type FlagKey,
  type Place,
} from "../types";

const SCOPE_KEYS: Record<ClaimScope, StringKey> = {
  unknown: "editor.scopeUnknown",
  all: "editor.scopeAll",
  some: "editor.scopeSome",
  none: "editor.scopeNone",
};

const CONFIDENCE_KEYS: Record<ClaimConfidence, StringKey> = {
  unverified: "editor.confUnverified",
  claimed: "editor.confClaimed",
  verified: "editor.confVerified",
};

const blankPlace = (): Place => ({
  id: "",
  name: "",
  category: "cafe",
  lat: 0,
  lng: 0,
  city: "Santiago",
  items: [],
  claims: {
    roastsOnSite: { ...UNKNOWN_CLAIM },
    specialty: { ...UNKNOWN_CLAIM },
    glutenFree: { ...UNKNOWN_CLAIM },
    seedOilFree: { ...UNKNOWN_CLAIM },
  },
  flags: [],
  sources: [],
  addedAt: new Date().toISOString().slice(0, 10),
});

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function PlaceEditor() {
  const editing = useStore((s) => s.editing);
  const setEditing = useStore((s) => s.setEditing);
  const persistPlace = useStore((s) => s.persistPlace);
  const session = useStore((s) => s.session);
  const { t, lang } = useT();

  const isNew = editing === "new";
  const [place, setPlace] = useState<Place>(() =>
    isNew ? blankPlace() : { ...(editing as Place) },
  );
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);

  if (!editing) return null;

  const patch = (p: Partial<Place>) => setPlace((cur) => ({ ...cur, ...p }));
  const patchClaim = (key: ClaimKey, c: Partial<Claim>) =>
    setPlace((cur) => ({ ...cur, claims: { ...cur.claims, [key]: { ...cur.claims[key], ...c } } }));
  const toggleFlag = (f: FlagKey) =>
    setPlace((cur) => ({
      ...cur,
      flags: cur.flags.includes(f) ? cur.flags.filter((x) => x !== f) : [...cur.flags, f],
    }));

  const runGeocode = async () => {
    setGeoBusy(true);
    setGeoErr(null);
    setHits(null);
    try {
      const found = await geocode(q || place.name);
      if (!found.length) setGeoErr(t("editor.geoNoResults"));
      setHits(found);
    } catch (err) {
      setGeoErr(err instanceof Error ? err.message : String(err));
    } finally {
      setGeoBusy(false);
    }
  };

  const pickHit = (h: GeocodeHit) => {
    patch({
      lat: h.lat,
      lng: h.lng,
      address: h.address ?? place.address,
      comuna: h.comuna ?? place.comuna,
      sources: place.sources.includes(h.osm) ? place.sources : [...place.sources, h.osm],
    });
    setHits(null);
  };

  /**
   * Marking something verified stamps who and when into the claim's own source.
   * The Claim model already carries provenance, so attribution needs no new
   * field — and "verified" with nobody's name on it is the exact record this
   * app exists to not produce.
   */
  const setConfidence = (key: ClaimKey, confidence: ClaimConfidence) => {
    const today = new Date().toISOString().slice(0, 10);
    const who = session?.user?.email ?? "editor";
    const cur = place.claims[key];
    // Don't clobber a source the editor typed; only fill an empty one or a prior
    // auto-stamp. Both languages' prefixes are matched so switching UI language
    // mid-edit doesn't double-stamp.
    const isAutoStamp = /^(Comprobado por|Checked by)\b/.test(cur.source ?? "");
    const autoSource =
      confidence === "verified" && (!cur.source || isAutoStamp)
        ? t("editor.verifiedBy", { who, date: today })
        : cur.source;
    patchClaim(key, { confidence, source: autoSource, checkedAt: today });
  };

  const canSave =
    place.name.trim().length > 1 &&
    place.lat !== 0 &&
    place.lng !== 0 &&
    place.sources.length > 0 &&
    // Mirrors the DB constraint so the failure is a disabled button with a
    // reason, not a rejected write with a Postgres error.
    CLAIM_KEYS.every(
      (k) => place.claims[k].confidence === "unverified" || Boolean(place.claims[k].source?.trim()),
    );

  const save = async () => {
    setSaving(true);
    setSaveErr(null);
    const final: Place = {
      ...place,
      id: place.id || `cur_${slug(place.name)}`,
      name: place.name.trim(),
    };
    const { error } = await persistPlace(final);
    setSaving(false);
    if (error) setSaveErr(error);
  };

  return (
    <div className="sheet sheet--editor" role="dialog" aria-label={t("editor.dialogLabel")}>
      <button
        className="sheet__close"
        onClick={() => setEditing(null)}
        aria-label={t("common.close")}
      >
        ✕
      </button>

      <header className="sheet__head">
        <span className="sheet__cat">{isNew ? t("editor.new") : t("editor.editing")}</span>
        <h2>{place.name || t("editor.noName")}</h2>
      </header>

      <section className="sheet__section">
        <h3>{t("editor.basics")}</h3>
        <label className="field">
          <span>{t("editor.name")}</span>
          <input value={place.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>{t("editor.type")}</span>
          <select
            value={place.category}
            onChange={(e) => patch({ category: e.target.value as Place["category"] })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c].icon} {CATEGORY_LABELS[c][lang]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="sheet__section">
        <h3>{t("editor.where")}</h3>
        {/* No lat/lng inputs, deliberately. A typo'd coordinate looks identical
            to a real one and sends someone to the wrong street. */}
        <div className="geo">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("editor.geoPlaceholder")}
            onKeyDown={(e) => e.key === "Enter" && runGeocode()}
          />
          <button className="btn" onClick={runGeocode} disabled={geoBusy || !(q || place.name)}>
            {geoBusy ? t("editor.searching") : t("editor.search")}
          </button>
        </div>
        {geoErr && <p className="field__err">{geoErr}</p>}
        {hits?.map((h) => (
          <button key={h.osm} className="geo-hit" onClick={() => pickHit(h)}>
            {h.display}
          </button>
        ))}
        {place.lat !== 0 ? (
          <p className="geo-ok">
            📍 {place.address ?? t("editor.noStreet")}
            {place.comuna && `, ${place.comuna}`}
            <br />
            <small>
              {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
            </small>
          </p>
        ) : (
          <p className="field__hint">{t("editor.geoHint")}</p>
        )}
      </section>

      <section className="sheet__section">
        <h3>{t("sheet.whatYouFind")}</h3>
        <div className="menu-panel__chips">
          {ITEMS.map((item) => {
            // Store items in Spanish regardless of UI language, so the data stays
            // consistent and placeHasItem's aliases keep matching.
            const canonical = item.label.es;
            const on = place.items.some((i) => i.toLowerCase() === canonical.toLowerCase());
            return (
              <button
                key={item.id}
                className={`chip chip--item ${on ? "is-on" : ""}`}
                onClick={() =>
                  patch({
                    items: on
                      ? place.items.filter((i) => i.toLowerCase() !== canonical.toLowerCase())
                      : [...place.items, canonical],
                  })
                }
              >
                {item.label[lang]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="sheet__section">
        <h3>{t("sheet.whatWeKnow")}</h3>
        {CLAIM_KEYS.map((key) => {
          const claim = place.claims[key];
          return (
            <div key={key} className="claim-edit">
              <strong>{CLAIM_LABELS[key][lang]}</strong>
              <div className="claim-edit__row">
                <select
                  value={claim.scope}
                  onChange={(e) => patchClaim(key, { scope: e.target.value as ClaimScope })}
                >
                  {(Object.keys(SCOPE_KEYS) as ClaimScope[]).map((s) => (
                    <option key={s} value={s}>
                      {t(SCOPE_KEYS[s])}
                    </option>
                  ))}
                </select>
                <select
                  value={claim.confidence}
                  onChange={(e) => setConfidence(key, e.target.value as ClaimConfidence)}
                  disabled={claim.scope === "unknown"}
                >
                  {(Object.keys(CONFIDENCE_KEYS) as ClaimConfidence[]).map((c) => (
                    <option key={c} value={c}>
                      {t(CONFIDENCE_KEYS[c])}
                    </option>
                  ))}
                </select>
              </div>
              {claim.confidence !== "unverified" && (
                <input
                  className="claim-edit__source"
                  value={claim.source ?? ""}
                  onChange={(e) => patchClaim(key, { source: e.target.value })}
                  placeholder={t("editor.sourcePlaceholder")}
                />
              )}
              {claim.scope !== "unknown" && (
                <input
                  className="claim-edit__note"
                  value={claim.note ?? ""}
                  onChange={(e) => patchClaim(key, { note: e.target.value })}
                  placeholder={t("editor.notePlaceholder")}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="sheet__section">
        <h3>{t("editor.amenities")}</h3>
        {/* Flags are plain toggles — no scope, no confidence, no source. That's
            the point of the two-tier model: a power outlet needs no provenance. */}
        {ATTR_GROUPS.filter((g) => g.flags.length > 0).map((group) => (
          <div key={group.id} className="menu-panel__group">
            <h4 className="menu-panel__group-title">{group.label[lang]}</h4>
            <div className="menu-panel__chips">
              {group.flags.map((f) => (
                <button
                  key={f}
                  className={`chip chip--flag ${place.flags.includes(f) ? "is-on" : ""}`}
                  onClick={() => toggleFlag(f)}
                  aria-pressed={place.flags.includes(f)}
                >
                  {FLAG_LABELS[f][lang]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="sheet__section">
        <h3>{t("editor.photo")}</h3>
        {/* Camera first, URL second. Someone standing in the café has a photo
            on their phone, not a hosted image — asking for a URL is asking them
            to solve hosting before they can contribute. */}
        <label className="photo-pick">
          <input
            type="file"
            accept="image/*"
            // Opens the camera directly on a phone rather than the file browser.
            capture="environment"
            disabled={upBusy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUpBusy(true);
              setUpErr(null);
              const { url, error } = await uploadPlacePhoto(file, place.id || slug(place.name));
              setUpBusy(false);
              if (error) setUpErr(error);
              else if (url) patch({ photoUrl: url });
              // Let the same file be picked again after an error.
              e.target.value = "";
            }}
          />
          <span className="photo-pick__face">
            {upBusy ? t("editor.photoUploading") : t("editor.photoPick")}
          </span>
        </label>
        {upErr && <p className="field__err">{upErr}</p>}

        <label className="field">
          <span>{t("editor.photoUrl")}</span>
          <input
            value={place.photoUrl ?? ""}
            onChange={(e) => patch({ photoUrl: e.target.value || undefined })}
            placeholder="https://…"
          />
        </label>
        <label className="field">
          <span>{t("editor.photoCredit")}</span>
          <input
            value={place.photoCredit ?? ""}
            onChange={(e) => patch({ photoCredit: e.target.value || undefined })}
            placeholder={t("editor.photoCreditPlaceholder")}
          />
        </label>
        {/* Said plainly in the UI, not just in a code comment: a stock photo on
            a real business is a small lie, and this app's claim is that it
            doesn't tell those. */}
        <p className="field__hint">{t("editor.photoNote")}</p>
        {place.photoUrl && (
          <div className="editor__photo-wrap">
            <img className="editor__photo-preview" src={place.photoUrl} alt="" />
            <button
              type="button"
              className="editor__photo-clear"
              onClick={() => patch({ photoUrl: undefined })}
            >
              {t("editor.photoRemove")}
            </button>
          </div>
        )}
      </section>

      <section className="sheet__section">
        <h3>{t("editor.sourcesAndCaveats")}</h3>
        <label className="field">
          <span>{t("editor.sourcesLabel")}</span>
          <textarea
            rows={2}
            value={place.sources.join("\n")}
            onChange={(e) =>
              patch({ sources: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
            }
            placeholder="https://…"
          />
        </label>
        <label className="field">
          <span>{t("editor.caveatLabel")}</span>
          <input
            value={place.caveat ?? ""}
            onChange={(e) => patch({ caveat: e.target.value || undefined })}
            placeholder={t("editor.caveatPlaceholder")}
          />
        </label>
      </section>

      {saveErr && <p className="field__err">{saveErr}</p>}
      {!canSave && <p className="field__hint">{t("editor.saveHint")}</p>}

      <div className="editor__actions">
        <button className="btn" onClick={() => setEditing(null)}>
          {t("editor.cancel")}
        </button>
        <button className="btn btn--primary" onClick={save} disabled={!canSave || saving}>
          {saving ? t("editor.saving") : t("editor.save")}
        </button>
      </div>
    </div>
  );
}
