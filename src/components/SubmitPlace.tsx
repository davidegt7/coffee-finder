import { useState } from "react";
import { useStore } from "../store";
import { submitPlace } from "../lib/submissions";
import { ITEMS } from "../lib/items";
import { useT } from "../lib/useT";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CLAIM_KEYS,
  CLAIM_LABELS,
  FLAG_KEYS,
  FLAG_LABELS,
  type Category,
} from "../types";

/**
 * The public "list my café" form, for owners.
 *
 * No account required — an owner shouldn't have to sign up to ask to be listed.
 * That's safe because this is a dead end: submissions render nowhere public and
 * only editors can read them.
 *
 * What the owner ticks under "what applies to you" is recorded as *assertions*,
 * not as claims. An owner saying "we roast on site" is the definition of a
 * `claimed` fact with the owner as its source, and it only reaches the map when
 * an editor promotes it — carrying that provenance with it. The copy says so
 * plainly, because a form that implies "tick this and it's true" would quietly
 * launder marketing into the one thing this app is for.
 */
export function SubmitPlace() {
  const setSubmitOpen = useStore((s) => s.setSubmitOpen);
  const { t, lang } = useT();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("cafe");
  const [address, setAddress] = useState("");
  const [comuna, setComuna] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [asserts, setAsserts] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const canSubmit =
    name.trim().length > 1 && address.trim().length > 3 && /\S+@\S+\.\S+/.test(contactEmail) && !busy;

  if (done) {
    return (
      <div className="sheet sheet--editor" role="dialog" aria-label={t("submit.title")}>
        <button
          className="sheet__close"
          onClick={() => setSubmitOpen(false)}
          aria-label={t("common.close")}
        >
          ✕
        </button>
        <header className="sheet__head">
          <h2>{t("submit.thanksTitle")}</h2>
        </header>
        <p className="field__hint">{t("submit.thanksBody")}</p>
        <div className="editor__actions">
          <button className="btn btn--primary" onClick={() => setSubmitOpen(false)}>
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet sheet--editor" role="dialog" aria-label={t("submit.title")}>
      <button
        className="sheet__close"
        onClick={() => setSubmitOpen(false)}
        aria-label={t("common.close")}
      >
        ✕
      </button>

      <header className="sheet__head">
        <span className="sheet__cat">{t("submit.eyebrow")}</span>
        <h2>{t("submit.title")}</h2>
        <p className="sheet__addr">{t("submit.intro")}</p>
      </header>

      <section className="sheet__section">
        <h3>{t("submit.aboutPlace")}</h3>
        <label className="field">
          <span>{t("editor.name")} *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("editor.type")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c].icon} {CATEGORY_LABELS[c][lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("submit.address")} *</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("submit.addressPlaceholder")}
          />
        </label>
        <label className="field">
          <span>{t("submit.comuna")}</span>
          <input value={comuna} onChange={(e) => setComuna(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("sheet.website")}</span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        </label>
        <label className="field">
          <span>Instagram</span>
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@…" />
        </label>
      </section>

      <section className="sheet__section">
        <h3>{t("submit.whatApplies")}</h3>
        {/* Framed as "what you'd tell us", not "tick to make it true". */}
        <p className="field__hint">{t("submit.assertsNote")}</p>
        <div className="menu-panel__chips">
          {CLAIM_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip chip--claim ${asserts.includes(k) ? "is-some" : ""}`}
              onClick={() => toggle(asserts, k, setAsserts)}
              aria-pressed={asserts.includes(k)}
            >
              {CLAIM_LABELS[k][lang]}
            </button>
          ))}
          {FLAG_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip chip--flag ${asserts.includes(k) ? "is-on" : ""}`}
              onClick={() => toggle(asserts, k, setAsserts)}
              aria-pressed={asserts.includes(k)}
            >
              {FLAG_LABELS[k][lang]}
            </button>
          ))}
        </div>
      </section>

      <section className="sheet__section">
        <h3>{t("sheet.whatYouFind")}</h3>
        <div className="menu-panel__chips">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip chip--item ${items.includes(item.label.es) ? "is-on" : ""}`}
              onClick={() => toggle(items, item.label.es, setItems)}
              aria-pressed={items.includes(item.label.es)}
            >
              {item.label[lang]}
            </button>
          ))}
        </div>
      </section>

      <section className="sheet__section">
        <h3>{t("submit.contact")}</h3>
        <label className="field">
          <span>{t("submit.contactEmail")} *</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder={t("admin.emailPlaceholder")}
          />
        </label>
        <label className="field">
          <span>{t("submit.contactName")}</span>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("submit.note")}</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("submit.notePlaceholder")}
          />
        </label>
      </section>

      {err && <p className="field__err">{err}</p>}
      {!canSubmit && !busy && <p className="field__hint">{t("submit.required")}</p>}

      <div className="editor__actions">
        <button className="btn" onClick={() => setSubmitOpen(false)}>
          {t("editor.cancel")}
        </button>
        <button
          className="btn btn--primary"
          disabled={!canSubmit}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const res = await submitPlace({
              name,
              category,
              address,
              comuna,
              website,
              instagram,
              contactEmail,
              contactName,
              asserts,
              items,
              note,
            });
            setBusy(false);
            if (res.error) setErr(res.error);
            else setDone(true);
          }}
        >
          {busy ? t("editor.saving") : t("submit.send")}
        </button>
      </div>
    </div>
  );
}
