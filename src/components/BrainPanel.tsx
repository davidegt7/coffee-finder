import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  BrainError,
  brainHealth,
  extract,
  setBrain,
  type BrainHealth,
  type BrainSuggestion,
} from "../lib/brain";
import { ITEMS } from "../lib/items";
import { useT } from "../lib/useT";
import type { StringKey } from "../lib/i18n";
import {
  CATEGORY_LABELS,
  CLAIM_LABELS,
  FLAG_LABELS,
  type ClaimKey,
  type Place,
} from "../types";

/**
 * "Extraer desde un link" — reads a café's own page and proposes fields.
 *
 * Two things make this safe enough to ship inside an editor whose whole premise
 * is that its data is trustworthy:
 *
 *   1. Nothing applies itself. Every row is accepted by hand, and the
 *      consequential fields — the four claims — are accepted one at a time.
 *   2. Everything lands as `confidence: "claimed"`, sourced to the link. The
 *      suggestion type has no confidence field to raise, so there is no path
 *      from "the website says so" to "we checked".
 *
 * Renders nothing at all when the bridge isn't running, which is the normal
 * state on the deployed site.
 */

const SCOPE_KEYS = {
  all: "editor.scopeAll",
  some: "editor.scopeSome",
  none: "editor.scopeNone",
} as const satisfies Record<string, StringKey>;

interface Row {
  id: string;
  label: string;
  /** What the form holds now, when it differs and the editor should see it. */
  current?: string;
  next: string;
  apply: (p: Place) => Place;
}

export function BrainPanel({
  place,
  onApply,
  onAddressApplied,
}: {
  place: Place;
  onApply: Dispatch<SetStateAction<Place>>;
  onAddressApplied?: (address: string) => void;
}) {
  const { t, lang } = useT();
  const [health, setHealth] = useState<BrainHealth | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BrainSuggestion | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  /**
   * The form as it stood when the extraction ran. Rows are built against this
   * snapshot rather than the live place, so accepting one row never adds,
   * removes, or reorders the others — the button you are about to click stays
   * where it is. Building against the live place made accepted text rows
   * vanish (they now equalled the current value) and slid the next row up
   * under the cursor, which in a field-by-field review is how you apply
   * something you didn't mean to.
   */
  const [baseline, setBaseline] = useState<Place | null>(null);

  useEffect(() => {
    void brainHealth().then(setHealth);
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!result || !baseline) return [];
    const place = baseline;
    const src = result.sources[0] ?? url;
    const today = new Date().toISOString().slice(0, 10);
    const out: Row[] = [];

    const text = (
      id: string,
      labelKey: StringKey,
      value: string | undefined,
      currentValue: string | undefined,
      key: keyof Place,
    ) => {
      if (!value || value === currentValue) return;
      out.push({
        id,
        label: t(labelKey),
        current: currentValue,
        next: value,
        apply: (p) => ({ ...p, [key]: value }),
      });
    };

    text("name", "editor.name", result.name, place.name || undefined, "name");
    if (result.category && result.category !== place.category) {
      out.push({
        id: "category",
        label: t("editor.type"),
        current: `${CATEGORY_LABELS[place.category].icon} ${CATEGORY_LABELS[place.category][lang]}`,
        next: `${CATEGORY_LABELS[result.category].icon} ${CATEGORY_LABELS[result.category][lang]}`,
        apply: (p) => ({ ...p, category: result.category! }),
      });
    }
    // The address is a suggestion for the geocoder's search box, not a fact
    // being written — the coordinates still come from Nominatim.
    text("address", "submit.address", result.address, place.address, "address");
    text("comuna", "submit.comuna", result.comuna, place.comuna, "comuna");
    text("city", "brain.city", result.city, place.city, "city");
    text("website", "sheet.website", result.website, place.website, "website");
    text("instagram", "brain.instagram", result.instagram, place.instagram, "instagram");

    for (const [key, claim] of Object.entries(result.claims) as [ClaimKey, { scope: "all" | "some" | "none"; note?: string }][]) {
      const cur = place.claims[key];
      out.push({
        id: `claim:${key}`,
        label: CLAIM_LABELS[key][lang],
        current: cur.scope === "unknown" ? undefined : t(SCOPE_KEYS[cur.scope]),
        next: `${t(SCOPE_KEYS[claim.scope])} · ${t("editor.confClaimed").toLowerCase()}${claim.note ? ` — ${claim.note}` : ""}`,
        apply: (p) => ({
          ...p,
          claims: {
            ...p.claims,
            [key]: {
              scope: claim.scope,
              // Not negotiable, and not the model's to decide. A page saying
              // something is the textbook definition of "claimed".
              confidence: "claimed",
              source: src,
              note: claim.note ?? p.claims[key].note,
              checkedAt: today,
            },
          },
        }),
      });
    }

    const newItems = result.items
      .map((id) => ITEMS.find((i) => i.id === id))
      .filter((i): i is (typeof ITEMS)[number] => Boolean(i))
      // The editor stores canonical Spanish labels regardless of UI language.
      .filter((i) => !place.items.some((h) => h.toLowerCase() === i.label.es.toLowerCase()));
    if (newItems.length) {
      out.push({
        id: "items",
        label: t("sheet.whatYouFind"),
        next: newItems.map((i) => i.label[lang]).join(", "),
        apply: (p) => ({ ...p, items: [...p.items, ...newItems.map((i) => i.label.es)] }),
      });
    }

    const newFlags = result.flags.filter((f) => !place.flags.includes(f));
    if (newFlags.length) {
      out.push({
        id: "flags",
        label: t("editor.amenities"),
        next: newFlags.map((f) => FLAG_LABELS[f][lang]).join(", "),
        apply: (p) => ({ ...p, flags: [...p.flags, ...newFlags] }),
      });
    }

    if (result.caveat && result.caveat !== place.caveat) {
      out.push({
        id: "caveat",
        label: t("editor.caveatLabel"),
        current: place.caveat,
        next: result.caveat,
        apply: (p) => ({ ...p, caveat: result.caveat }),
      });
    }

    const newSources = result.sources.filter((s) => !place.sources.includes(s));
    if (newSources.length) {
      out.push({
        id: "sources",
        label: t("brain.sourcesRow"),
        next: newSources.join("\n"),
        apply: (p) => ({ ...p, sources: [...p.sources, ...newSources] }),
      });
    }

    return out;
  }, [result, baseline, lang, t, url]);

  if (health === undefined || health === null) return null;

  const pending = rows.filter((r) => !applied.has(r.id));

  const run = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    setApplied(new Set());
    try {
      const res = await extract(url.trim());
      setBaseline(place);
      setResult(res.suggestion);
    } catch (e) {
      if (e instanceof BrainError && e.code === "google_maps") setErr(t("brain.errGoogleMaps"));
      else if (e instanceof BrainError && e.code === "bad_url") setErr(t("brain.errBadUrl"));
      else setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const swapBrain = async (name: string) => {
    setErr(null);
    try {
      await setBrain(name);
      setHealth(await brainHealth());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const useRow = (row: Row) => {
    onApply(row.apply);
    if (row.id === "address" && result?.address) onAddressApplied?.(result.address);
    setApplied((cur) => new Set(cur).add(row.id));
  };

  const useAll = () => {
    onApply((cur) => pending.reduce((acc, r) => r.apply(acc), cur));
    if (pending.some((row) => row.id === "address") && result?.address) {
      onAddressApplied?.(result.address);
    }
    setApplied(new Set(rows.map((r) => r.id)));
  };

  return (
    <section className="sheet__section brain">
      <h3>{t("brain.title")}</h3>
      <p className="field__hint">{t("brain.intro")}</p>

      <div className="geo">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("brain.urlPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && void run()}
        />
        <button className="btn" onClick={() => void run()} disabled={busy || !url.trim()}>
          {busy ? t("brain.extracting") : t("brain.extract")}
        </button>
      </div>

      <div className="brain__pick">
        <label className="brain__pick-label">
          <span>{t("brain.brainLabel")}</span>
          <select value={health.name} onChange={(e) => void swapBrain(e.target.value)} disabled={busy}>
            {health.brains.map((b) => (
              // Not-ready brains stay visible and say what's missing — a hidden
              // option teaches nobody how to turn it on.
              <option key={b.name} value={b.name} disabled={!b.ready}>
                {b.label}
                {b.ready ? "" : ` — ${t("brain.notReady", { needs: b.needs })}`}
              </option>
            ))}
          </select>
        </label>
        {!health.agentic && <p className="field__hint">{t("brain.notAgentic")}</p>}
      </div>

      {err && <p className="field__err">{err}</p>}

      {result && (
        <>
          {rows.length === 0 && <p className="field__hint">{t("brain.nothing")}</p>}

          {rows.map((row) => {
            const done = applied.has(row.id);
            return (
              <div key={row.id} className={`brain__row ${done ? "is-done" : ""}`}>
                <div className="brain__row-body">
                  <strong>{row.label}</strong>
                  {row.current && (
                    <span className="brain__current">{t("brain.now", { current: row.current })}</span>
                  )}
                  <span className="brain__next">{row.next}</span>
                </div>
                <button
                  className="btn brain__use"
                  onClick={() => useRow(row)}
                  disabled={done}
                  aria-label={`${t("brain.use")} — ${row.label}`}
                >
                  {done ? "✓" : t("brain.use")}
                </button>
              </div>
            );
          })}

          {pending.length > 1 && (
            <button className="btn brain__all" onClick={useAll}>
              {t("brain.useAll", { n: pending.length })}
            </button>
          )}

          {result.notes && (
            <p className="brain__notes">
              <strong>{t("brain.notesLabel")}</strong> {result.notes}
            </p>
          )}

          {/* Said in the UI, not just in a comment: the reader of this panel is
              the person who decides what the app claims to know. */}
          <p className="field__hint">{t("brain.claimNote")}</p>
          <p className="field__hint">{t("brain.geoNote")}</p>
        </>
      )}
    </section>
  );
}
