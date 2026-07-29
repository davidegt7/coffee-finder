import type { Claim, ClaimKey } from "../types";
import { CLAIM_LABELS } from "../types";
import { useT } from "../lib/useT";

/**
 * Splits the two axes across two channels so the badge stays short enough for a
 * list row: the *text* carries scope, the *colour and mark* carry confidence.
 *
 * Composes on the label ("<label> · 100%") rather than wrapping it in a
 * sentence, because no single sentence template fits "Tuesta acá" and "Sin
 * gluten" grammatically in both languages.
 */
export function ClaimBadge({ claimKey, claim }: { claimKey: ClaimKey; claim: Claim }) {
  const { t, lang } = useT();
  if (claim.scope === "unknown" || claim.confidence === "unverified") return null;

  const label = CLAIM_LABELS[claimKey][lang];
  const text =
    claim.scope === "all"
      ? `${label} ${t("badge.scope100")}`
      : claim.scope === "some"
        ? `${label} ${t("badge.scopeOptions")}`
        : claim.scope === "none"
          ? t("badge.scopeNone", { label: label.toLowerCase() })
          : null;
  if (!text) return null;

  const tone = claim.scope === "none" ? "no" : claim.confidence;
  const title = claim.confidence === "verified" ? t("badge.titleVerified") : t("badge.titleClaimed");

  return (
    <span className={`badge badge--${tone}`} title={[title, claim.note].filter(Boolean).join(" ")}>
      {text}
      <span className="badge__mark" aria-hidden="true">
        {claim.confidence === "verified" ? "✓" : "?"}
      </span>
      <span className="sr-only">
        {claim.confidence === "verified" ? t("badge.srVerified") : t("badge.srUnverified")}
      </span>
    </span>
  );
}

/**
 * A claim we actually know something about.
 *
 * Tinted by confidence rather than rendered identically to everything else: the
 * whole point of the two-axis model is that "someone checked" and "the shop says
 * so" are different kinds of fact, and a flat list of four identical rows threw
 * that distinction away visually right after the data model went to the trouble
 * of keeping it.
 *
 * Unknowns are NOT rendered here — see UnknownClaims. Giving each one a full row
 * repeated "nobody has checked" three times, then the summary said it a fourth.
 */
export function ClaimRow({ claimKey, claim }: { claimKey: ClaimKey; claim: Claim }) {
  const { t, lang } = useT();
  if (claim.scope === "unknown") return null;

  const label = CLAIM_LABELS[claimKey][lang];
  const tone = claim.scope === "none" ? "no" : claim.confidence;

  const scopeText =
    claim.scope === "all"
      ? t("claim.scopeAll")
      : claim.scope === "some"
        ? t("claim.scopeSome")
        : t("claim.no");

  const confText =
    claim.confidence === "verified"
      ? t("claim.confVerified")
      : claim.confidence === "claimed"
        ? t("claim.confClaimed")
        : t("claim.confUnverified");

  return (
    <div className={`claim-card claim-card--${tone}`}>
      <div className="claim-card__top">
        <span className="claim-card__label">{label}</span>
        <span className="claim-card__scope">{scopeText}</span>
      </div>

      {claim.note && <p className="claim-card__note">{claim.note}</p>}

      <p className="claim-card__meta">
        <span className={`claim-card__conf claim-card__conf--${tone}`}>
          {claim.confidence === "verified" ? "✓" : "?"} {confText}
        </span>
        {claim.source && (
          <>
            {" · "}
            {claim.source.startsWith("http") ? (
              <a href={claim.source} target="_blank" rel="noopener noreferrer">
                {new URL(claim.source).hostname.replace(/^www\./, "")}
              </a>
            ) : (
              claim.source
            )}
          </>
        )}
        {claim.checkedAt && ` · ${claim.checkedAt}`}
      </p>
    </div>
  );
}

/**
 * Every unchecked axis in one quiet block.
 *
 * These are the majority of rows on most places, and they all say the same
 * thing. As individual rows they buried the one or two facts that *are* known
 * under repetition; as a list of names with a single explanation they stay
 * honest and stop shouting.
 */
export function UnknownClaims({ keys }: { keys: ClaimKey[] }) {
  const { t, lang } = useT();
  if (keys.length === 0) return null;

  return (
    <div className="claim-unknown">
      <div className="claim-unknown__head">
        <span className="claim-unknown__title">{t("claim.uncheckedStatus")}</span>
        <span className="claim-unknown__n">{keys.length}</span>
      </div>
      <p className="claim-unknown__list">
        {keys.map((k) => CLAIM_LABELS[k][lang]).join(" · ")}
      </p>
      <p className="claim-unknown__why">{t("claim.uncheckedWhy")}</p>
    </div>
  );
}
