import { useState } from "react";
import { useStore } from "../store";
import { setSubmissionStatus, type Submission } from "../lib/submissions";
import { INTENTS } from "../lib/items";
import {
  DRINK_STYLES,
  FILTER_METHODS,
  ROAST_LEVELS,
  SOURCING_MODELS,
} from "../lib/coffee";
import { useT } from "../lib/useT";
import {
  CATEGORY_LABELS,
  CLAIM_KEYS,
  CLAIM_LABELS,
  FLAG_KEYS,
  FLAG_LABELS,
  UNKNOWN_CLAIM,
  type ClaimKey,
  type FlagKey,
  type Place,
} from "../types";

/**
 * The editor-only inbox of owner submissions.
 *
 * "Approve" deliberately does NOT publish. It opens the normal place editor
 * pre-filled with what the owner sent, so the editor still has to geocode the
 * address (no hand-typed coordinates, ever) and decide what each assertion is
 * worth. Anything the owner ticked arrives as `claimed` with the owner named as
 * the source — never `verified`, because the owner is not a disinterested party.
 */
function submissionToPlace(s: Submission, today: string): Place {
  const claims = Object.fromEntries(
    CLAIM_KEYS.map((k) => [
      k,
      k === "specialty" && typeof s.specialtyCoffee === "boolean"
        ? {
            scope: s.specialtyCoffee ? ("all" as const) : ("none" as const),
            confidence: "claimed" as const,
            source: `Declarado por el local (${s.contactEmail})`,
            checkedAt: today,
          }
        : s.asserts.includes(k)
        ? {
            scope: "all" as const,
            confidence: "claimed" as const,
            source: `Declarado por el local (${s.contactEmail})`,
            checkedAt: today,
          }
        : { ...UNKNOWN_CLAIM },
    ]),
  ) as Record<ClaimKey, Place["claims"][ClaimKey]>;

  return {
    // lat/lng left at 0 on purpose — the editor's Save button stays disabled
    // until the address is actually geocoded.
    id: "",
    name: s.name,
    category: s.category,
    lat: 0,
    lng: 0,
    address: s.address,
    comuna: s.comuna,
    city: s.city,
    country: s.country,
    countryCode: s.countryCode ?? "",
    website: s.website,
    instagram: s.instagram,
    items: s.items,
    drinkStyles: s.drinkStyles,
    coffeeBrand: s.coffeeBrand || undefined,
    espressoMachineBrand: s.espressoMachineBrand,
    espressoGrinderBrand: s.espressoGrinderBrand,
    filterGrinderBrand: s.filterGrinderBrand,
    filterMethods: s.filterMethods,
    roastLevels: s.roastLevels,
    cuppingScoreMin: s.cuppingScoreMin,
    cuppingScoreMax: s.cuppingScoreMax,
    sourcingModel: s.category === "roastery" ? s.sourcingModel : undefined,
    photoUrl: s.photoUrls[0] ?? s.photoUrl,
    claims,
    flags: s.asserts.filter((a): a is FlagKey => (FLAG_KEYS as readonly string[]).includes(a)),
    sources: [
      `Solicitud del local, ${s.contactEmail}, ${s.createdAt.slice(0, 10)}`,
    ],
    addedAt: today,
  };
}

export function SubmissionsQueue() {
  const submissions = useStore((s) => s.submissions);
  const reviewSubmission = useStore((s) => s.reviewSubmission);
  const refreshSubmissions = useStore((s) => s.refreshSubmissions);
  const session = useStore((s) => s.session);
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);

  if (submissions.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="queue">
      <button className="queue__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {t("queue.title")} <span className="menu-btn__count">{submissions.length}</span>
      </button>

      {open && (
        <div className="queue__list">
          {submissions.map((s) => (
            <article key={s.id} className="queue__item">
              <h4>
                {CATEGORY_LABELS[s.category]?.icon} {s.name}
              </h4>
              <p className="queue__addr">
                {s.address}
                {s.comuna && `, ${s.comuna}`}
                {`, ${s.city}, ${s.country}`}
              </p>
              {s.items.length > 0 && (
                <p className="queue__asserts">
                  {t("queue.offers")} {s.items
                    .map((id) => INTENTS.find((intent) => intent.id === id)?.label[lang] ?? id)
                    .join(", ")}
                </p>
              )}
              {s.coffeeBrand && (
                <p className="queue__asserts">
                  {t("queue.coffeeBrand")} {s.coffeeBrand}
                </p>
              )}
              {typeof s.specialtyCoffee === "boolean" && (
                <p className="queue__asserts">
                  {t("queue.specialty")} {s.specialtyCoffee
                    ? t("submit.specialtyYes")
                    : t("submit.specialtyNo")}
                </p>
              )}
              {s.drinkStyles.length > 0 && (
                <p className="queue__asserts">
                  {t("queue.program")} {s.drinkStyles
                    .map((id) => DRINK_STYLES.find((style) => style.id === id)?.label[lang] ?? id)
                    .join(", ")}
                </p>
              )}
              {(s.espressoMachineBrand || s.espressoGrinderBrand) && (
                <p className="queue__asserts">
                  {t("queue.espressoSetup")} {[s.espressoMachineBrand, s.espressoGrinderBrand]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {(s.filterGrinderBrand || s.filterMethods.length > 0) && (
                <p className="queue__asserts">
                  {t("queue.filterSetup")} {[
                    s.filterGrinderBrand,
                    ...s.filterMethods.map(
                      (id) => FILTER_METHODS.find((method) => method.id === id)?.label[lang] ?? id,
                    ),
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              {s.roastLevels.length > 0 && (
                <p className="queue__asserts">
                  {t("queue.roastLevels")} {s.roastLevels
                    .map((id) => ROAST_LEVELS.find((level) => level.id === id)?.label[lang] ?? id)
                    .join(", ")}
                </p>
              )}
              {(typeof s.cuppingScoreMin === "number" ||
                typeof s.cuppingScoreMax === "number") && (
                <p className="queue__asserts">
                  {t("queue.cuppingScore")} {typeof s.cuppingScoreMin === "number"
                    ? s.cuppingScoreMin
                    : "—"}–{typeof s.cuppingScoreMax === "number" ? s.cuppingScoreMax : "—"}
                </p>
              )}
              {s.category === "roastery" && s.sourcingModel && (
                <p className="queue__asserts">
                  {t("queue.sourcing")} {SOURCING_MODELS.find(
                    (model) => model.id === s.sourcingModel,
                  )?.label[lang] ?? s.sourcingModel}
                </p>
              )}
              {s.coffeePhotoUrl && (
                <div className="queue__coffee-photo">
                  <span>{t("queue.coffeePhoto")}</span>
                  <img src={s.coffeePhotoUrl} alt={t("submit.coffeePhotoAlt")} />
                </div>
              )}
              {s.asserts.some(
                (a) => !(a === "specialty" && typeof s.specialtyCoffee === "boolean"),
              ) && (
                <p className="queue__asserts">
                  {t("queue.claims")}{" "}
                  {s.asserts
                    .filter(
                      (a) => !(a === "specialty" && typeof s.specialtyCoffee === "boolean"),
                    )
                    .map(
                      (a) =>
                        CLAIM_LABELS[a as ClaimKey]?.[lang] ?? FLAG_LABELS[a as FlagKey]?.[lang] ?? a,
                    )
                    .join(", ")}
                </p>
              )}
              {s.note && <p className="queue__note">“{s.note}”</p>}
              {s.photoUrls.length > 0 && (
                <div className="queue__photos">
                  {s.photoUrls.map((url, index) => (
                    <img key={url} src={url} alt={t("submit.photoAlt", { n: index + 1 })} />
                  ))}
                </div>
              )}
              <p className="queue__contact">
                {s.contactName ? `${s.contactName} · ` : ""}
                <a href={`mailto:${s.contactEmail}`}>{s.contactEmail}</a>
              </p>
              <div className="queue__actions">
                <button
                  className="btn btn--primary"
                  onClick={() => reviewSubmission(s.id, submissionToPlace(s, today))}
                >
                  {t("queue.review")}
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    await setSubmissionStatus(s.id, "rejected", session?.user?.email ?? "editor");
                    await refreshSubmissions();
                  }}
                >
                  {t("queue.reject")}
                </button>
              </div>
            </article>
          ))}
          <p className="field__hint">{t("queue.note")}</p>
        </div>
      )}
    </div>
  );
}
