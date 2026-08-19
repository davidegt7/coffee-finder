import { useState } from "react";
import { useStore } from "../store";
import { submitPlace } from "../lib/submissions";
import { INTENTS } from "../lib/items";
import { uploadSubmissionCoffeePhoto, uploadSubmissionPhoto } from "../lib/photos";
import { useT } from "../lib/useT";
import { CoffeeDetailsFields } from "./CoffeeDetailsFields";
import { BeanDetailsFields } from "./BeanDetailsFields";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type DrinkStyle,
  type FilterMethod,
  type RoastLevel,
  type SourcingModel,
} from "../types";

const OWNER_CATEGORIES = CATEGORIES.filter((candidate) => candidate !== "cart");
const MAX_OWNER_PHOTOS = 3;

/**
 * The public "list my café" form, for owners.
 *
 * No account required — an owner shouldn't have to sign up to ask to be listed.
 * That's safe because this is a dead end: submissions render nowhere public and
 * only editors can read them.
 *
 * The choices deliberately mirror the two public search filters. Owners do not
 * need to classify every drink, food, amenity and production claim before they
 * can ask to be listed; an editor can add those specifics during review.
 */
export function SubmitPlace() {
  const setSubmitOpen = useStore((s) => s.setSubmitOpen);
  const { t, lang } = useT();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("cafe");
  const [address, setAddress] = useState("");
  const [comuna, setComuna] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [items, setItems] = useState<string[]>(["drink"]);
  const [coffeeBrand, setCoffeeBrand] = useState("");
  const [specialtyCoffee, setSpecialtyCoffee] = useState<boolean | null>(null);
  const [drinkStyles, setDrinkStyles] = useState<DrinkStyle[]>([]);
  const [espressoMachineBrand, setEspressoMachineBrand] = useState("");
  const [espressoGrinderBrand, setEspressoGrinderBrand] = useState("");
  const [filterGrinderBrand, setFilterGrinderBrand] = useState("");
  const [filterMethods, setFilterMethods] = useState<FilterMethod[]>([]);
  const [roastLevels, setRoastLevels] = useState<RoastLevel[]>([]);
  const [cuppingScoreMin, setCuppingScoreMin] = useState<number | undefined>();
  const [cuppingScoreMax, setCuppingScoreMax] = useState<number | undefined>();
  const [sourcingModel, setSourcingModel] = useState<SourcingModel | undefined>();
  const [advancedCoffeeOpen, setAdvancedCoffeeOpen] = useState(false);
  const [coffeePhotoUrl, setCoffeePhotoUrl] = useState("");
  const [coffeeUpBusy, setCoffeeUpBusy] = useState(false);
  const [coffeeUpErr, setCoffeeUpErr] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const canSubmit =
    name.trim().length > 1 &&
    address.trim().length > 3 &&
    city.trim().length > 1 &&
    country.trim().length > 1 &&
    coffeeBrand.trim().length > 1 &&
    specialtyCoffee !== null &&
    (!items.includes("drink") || drinkStyles.length > 0) &&
    !(
      typeof cuppingScoreMin === "number" &&
      typeof cuppingScoreMax === "number" &&
      cuppingScoreMin > cuppingScoreMax
    ) &&
    /\S+@\S+\.\S+/.test(contactEmail) &&
    !coffeeUpBusy &&
    !upBusy &&
    !busy;

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
        <div className="field-row">
          <label className="field">
            <span>{t("brain.city")} *</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("editor.country")} *</span>
            <input value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
        </div>
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
        <h3>{t("menu.item")}</h3>
        <div className="intents submit__intents">
          {INTENTS.map((intent) => (
            <button
              key={intent.id}
              type="button"
              className={`intent ${items.includes(intent.id) ? "is-active" : ""}`}
              onClick={() => toggle(items, intent.id, setItems)}
              aria-pressed={items.includes(intent.id)}
            >
              <span className="intent__icon" aria-hidden="true">{intent.icon}</span>
              <span className="intent__label">{intent.label[lang]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sheet__section">
        <h3>{t("menu.category")}</h3>
        <div className="menu-panel__chips">
          {OWNER_CATEGORIES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={`chip chip--cat ${category === candidate ? "is-on" : ""}`}
              onClick={() => setCategory(candidate as Category)}
              aria-pressed={category === candidate}
            >
              <span aria-hidden="true">{CATEGORY_LABELS[candidate].icon}</span>{" "}
              {CATEGORY_LABELS[candidate][lang]}
            </button>
          ))}
        </div>
      </section>

      <section className="sheet__section">
        <h3>{t("submit.coffeeTitle")}</h3>
        <label className="field">
          <span>{t("submit.coffeeBrand")} *</span>
          <input
            value={coffeeBrand}
            onChange={(event) => setCoffeeBrand(event.target.value)}
            placeholder={t("submit.coffeeBrandPlaceholder")}
          />
        </label>
        <fieldset className="submit__choice">
          <legend>{t("submit.specialtyQuestion")} *</legend>
          <div className="submit__choice-row">
            <button
              type="button"
              className={`chip chip--cat ${specialtyCoffee === true ? "is-on" : ""}`}
              onClick={() => setSpecialtyCoffee(true)}
              aria-pressed={specialtyCoffee === true}
            >
              {t("submit.specialtyYes")}
            </button>
            <button
              type="button"
              className={`chip chip--cat ${specialtyCoffee === false ? "is-on" : ""}`}
              onClick={() => setSpecialtyCoffee(false)}
              aria-pressed={specialtyCoffee === false}
            >
              {t("submit.specialtyNo")}
            </button>
          </div>
        </fieldset>
        <CoffeeDetailsFields
          drinkStyles={drinkStyles}
          onDrinkStylesChange={setDrinkStyles}
          espressoMachineBrand={espressoMachineBrand}
          onEspressoMachineBrandChange={setEspressoMachineBrand}
          espressoGrinderBrand={espressoGrinderBrand}
          onEspressoGrinderBrandChange={setEspressoGrinderBrand}
          filterGrinderBrand={filterGrinderBrand}
          onFilterGrinderBrandChange={setFilterGrinderBrand}
          filterMethods={filterMethods}
          onFilterMethodsChange={setFilterMethods}
        />
        <div className="submit__coffee-photo">
          <h4>{t("submit.coffeePhotoTitle")}</h4>
          <p className="field__hint">{t("submit.coffeePhotoNote")}</p>
          {!coffeePhotoUrl && (
            <label className="photo-pick">
              <input
                type="file"
                accept="image/*"
                disabled={coffeeUpBusy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setCoffeeUpBusy(true);
                  setCoffeeUpErr(null);
                  const { url, error } = await uploadSubmissionCoffeePhoto(file);
                  setCoffeeUpBusy(false);
                  if (error) setCoffeeUpErr(error);
                  else if (url) setCoffeePhotoUrl(url);
                  event.target.value = "";
                }}
              />
              <span className="photo-pick__face">
                {coffeeUpBusy ? t("editor.photoUploading") : t("submit.coffeePhotoPick")}
              </span>
            </label>
          )}
          {coffeeUpErr && <p className="field__err">{coffeeUpErr}</p>}
          {coffeePhotoUrl && (
            <div className="submit__photos submit__photos--coffee">
              <div className="submit__photo">
                <img src={coffeePhotoUrl} alt={t("submit.coffeePhotoAlt")} />
                <button
                  type="button"
                  onClick={() => setCoffeePhotoUrl("")}
                  aria-label={t("editor.photoRemove")}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {(items.includes("drink") || items.includes("beans") || category === "roastery") && (
        <section className="sheet__section">
          <button
            type="button"
            className={`advanced-toggle ${advancedCoffeeOpen ? "is-open" : ""}`}
            onClick={() => setAdvancedCoffeeOpen((open) => !open)}
            aria-expanded={advancedCoffeeOpen}
          >
            <span>{t("beans.advanced")}</span>
            <span aria-hidden="true">{advancedCoffeeOpen ? "−" : "+"}</span>
          </button>
          {advancedCoffeeOpen && (
            <div className="bean-filter__advanced">
              <h3>{t("beans.formTitle")}</h3>
              <BeanDetailsFields
                roastLevels={roastLevels}
                onRoastLevelsChange={setRoastLevels}
                cuppingScoreMin={cuppingScoreMin}
                onCuppingScoreMinChange={setCuppingScoreMin}
                cuppingScoreMax={cuppingScoreMax}
                onCuppingScoreMaxChange={setCuppingScoreMax}
                isRoastery={category === "roastery"}
                sourcingModel={sourcingModel}
                onSourcingModelChange={setSourcingModel}
              />
            </div>
          )}
        </section>
      )}

      <section className="sheet__section">
        <h3>{t("submit.photosTitle")}</h3>
        <p className="field__hint">{t("submit.photoNote")}</p>
        {photoUrls.length < MAX_OWNER_PHOTOS && (
          <label className="photo-pick">
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={upBusy}
              onChange={async (event) => {
                const files = [...(event.target.files ?? [])].slice(
                  0,
                  MAX_OWNER_PHOTOS - photoUrls.length,
                );
                if (!files.length) return;
                setUpBusy(true);
                setUpErr(null);
                const uploaded: string[] = [];
                for (const file of files) {
                  const { url, error } = await uploadSubmissionPhoto(file);
                  if (error) {
                    setUpErr(error);
                    break;
                  }
                  if (url) uploaded.push(url);
                }
                setPhotoUrls((current) => [...current, ...uploaded]);
                setUpBusy(false);
                event.target.value = "";
              }}
            />
            <span className="photo-pick__face">
              {upBusy ? t("editor.photoUploading") : t("submit.photoPick")}
            </span>
          </label>
        )}
        {upErr && <p className="field__err">{upErr}</p>}
        {photoUrls.length > 0 && (
          <div className="submit__photos">
            {photoUrls.map((url, index) => (
              <div className="submit__photo" key={url}>
                <img src={url} alt={t("submit.photoAlt", { n: index + 1 })} />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((current) => current.filter((item) => item !== url))}
                  aria-label={t("editor.photoRemove")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
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
              city,
              country,
              website,
              instagram,
              contactEmail,
              contactName,
              asserts: specialtyCoffee ? ["specialty"] : [],
              items,
              coffeeBrand,
              specialtyCoffee: specialtyCoffee!,
              drinkStyles,
              espressoMachineBrand,
              espressoGrinderBrand,
              filterGrinderBrand,
              filterMethods,
              roastLevels,
              cuppingScoreMin,
              cuppingScoreMax,
              sourcingModel: category === "roastery" ? sourcingModel : undefined,
              coffeePhotoUrl,
              photoUrls,
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
